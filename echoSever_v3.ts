/*
 * Author: Nathaniel Martes
 * Description:
 *   Creates a TCP echo sever listeing on port 127.0.0.1:1234.
 *   Once a connection is made, the client can send messages with each
 *   message ending with \n.
 */
import net from "node:net";

//connection promise wrapper so we dont have to use callbacks
type TCPConn = {
    socket: net.Socket;
    err: null | Error;
    ended: boolean;

    //nth callbacks of the promise of the current read
    reader: null | {
        resolve: (value: Buffer) => void,
        reject: (reason: Error) => void,
    };
};

/*
 * soInit setups a TCPConn for a connection socket, setting up callback events aswell
 */
function soInit(socket: net.Socket): TCPConn {
    const conn: TCPConn = {
        socket: socket, err: null, ended: false, reader: null,
    };

    socket.on('data', (data: Buffer) => {

        //pause the 'data' event until this current read is over
        conn.socket.pause();

        //fulfill the promise of the current read
        conn.reader!.resolve(data);

        //read is over
        conn.reader = null;
    });

    socket.on('end', () => {
        conn.ended = true;
        if (conn.reader) {
            conn.reader.resolve(Buffer.from(''));
            conn.reader = null;
        }
    });

    socket.on('error', (err: Error) => {
        conn.err = err;
        if (conn.reader) {
            conn.reader.reject(err);
            conn.reader = null;
        }
    });

    return conn;
}

/*
 * soRead is a Promise wrapper for the data event
 */
function soRead(conn: TCPConn): Promise<Buffer> { 
    console.assert(!conn.reader);
    return new Promise((resolve, reject) => {
        
        if (conn.err) {
            reject(conn.err);
            return;
        }
        if (conn.ended) {
            resolve(Buffer.from(''));
            return;
        }
        conn.reader = {resolve: resolve, reject: reject};
        conn.socket.resume();
    });
}

/*
 * soWrite is a Promise wrapper for socket.write() 
 */
function soWrite(conn: TCPConn, data: Buffer): Promise<void> {
    console.assert(data.length > 0);
    return new Promise((resolve, reject) => {
        if (conn.err) {
            reject(conn.err);
            return;
        }

        conn.socket.write(data, (err? : Error) => {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

/*
 * TCPListener is used to wrap socket.listen() and the connection event
 */
type TCPListener = {
    socket: net.Server;
    host: String,
    port: String
}

/*
 * soListen is a Promise wrapper for the listening socket
 */
function soListen(socket: net.Server, hostAddress: String, portAddress: String): TCPListener {
    const listener: TCPListener = {
        socket: socket,
        host: hostAddress,
        port: portAddress,
    };

    if (!socket.listening) {
        socket.listen({
            host: hostAddress,
            port: portAddress
        }, () => {
            console.log(`Server running on ${hostAddress}:${portAddress}`);
        });
    } else {
        console.log(`Server still listening on ${hostAddress}:${portAddress}`);
    }

    return listener;
}

/*
 * soAccept is a wrapper for the connection event
 */
function soAccept(listener: TCPListener): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        listener.socket.on("connection", (socket: net.Socket) => resolve(socket));
        listener.socket.on("error", (err: Error) => reject(err));
    });
}

/*
 * DynBuf is a dynamic buffer to store incoming data
 */
type DynBuf = {
    data: Buffer;
    length: number;
}

/*
 * pushBuf pushes a new buffer onto an exisiting dynamic buffer
 */
function pushBuf(buf: DynBuf, data: Buffer): void {
    const newLen = buf.length + data.length;
    if (newLen > buf.data.length) {
        let cap = buf.data.length;
        while (cap < newLen) {
            cap = cap * 2 + 1 
        }
        const newBuffer = Buffer.alloc(cap);
        buf.data.copy(newBuffer, newBuffer.length, buf.data.length);
        buf.data = newBuffer;
    }

    data.copy(buf.data, buf.length, 0);
    buf.length = newLen;
}

/*
 * popBuf removes the lastest message from a dynamic buffer
 */
function popBuf(buf: DynBuf, len: number): void {
    buf.data.copyWithin(0, len, buf.length);
    buf.length -= len;
}

/*
 * getMessage retrives a message from a dynamic buffer, returning null if a buffer doesnt contain a message
 */
function getMessage(buf: DynBuf): null | Buffer {
    if (buf.length === 0) return null;
    const endIndex = buf.data.indexOf('\n');
    if (endIndex === -1) return null;

    const msg: Buffer = Buffer.from(buf.data.subarray(0, endIndex + 1));
    popBuf(buf, endIndex + 1);
    return msg;
}

/*
 * newConn informs the server a new connection has been made, and serves the connection
 */
async function newConn(socket: net.Socket): Promise<void> {
    console.log(`new connection ${socket.remoteAddress}, ${socket.remotePort}`);
    try {
        await serveClient(socket);
    } catch (exc) {
        console.error(`exception: ${exc}`);
    } finally {
        socket.destroy();
    }
}

/*
 * serveClient serves the connection, reading the data and echoing it back to the connection
 */
async function serveClient(socket: net.Socket): Promise<void> {
    const conn: TCPConn = soInit(socket);
    const buf: DynBuf = {data: Buffer.alloc(0), length: 0};
    while (true) {
        const msg: null | Buffer = getMessage(buf);
        if (!msg) {
            const data: Buffer = await soRead(conn);
    
            if (data.length === 0){
                console.log(`Ending connection with ${socket.remoteAddress}:${socket.remotePort}`);
                return;
            }

            pushBuf(buf, data);

        } else {
            if (msg.equals(Buffer.from("quit\n"))) {
                await soWrite(conn, Buffer.from("Goodbye\n"));
                return;
            } else {
                console.log(`data[${msg.toString().replace("\n","\\n")}]`);
                await soWrite(conn, Buffer.concat([Buffer.from("Echo: "), msg]));
            }
        }
    }
}

/*
 * listenForClient waits for a connection if not already connected
 */
async function listenForClient(socket: net.Server): Promise<void> {
    while (true) {
        try {
            const listener: TCPListener = soListen(socket, "127.0.0.1", "1234");
            const connSocket: net.Socket = await soAccept(listener);
            await newConn(connSocket);
        } catch (exc) {
            console.error(`exception: ${exc}`);
            break;
        }
         
    }
}

const server = net.createServer({
    pauseOnConnect: true,
});

listenForClient(server);
