import net from "node:net";

//promise API wrapper so we dont have to use callbacks
type TCPConn = {

    //the JS socket object
    socket: net.Socket;

    //from the 'error' event
    err: null | Error;

    //FIN, from the 'end' event
    ended: boolean;

    //th callbacks of the promise of the current read
    reader: null | {
        resolve: (value: Buffer) => void,
        reject: (reason: Error) => void,
    };
};

//net.Socket wrapper
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
async function serveClient(socket: net.Socket): Promise<void> {
    const conn: TCPConn = soInit(socket);
    while (true) {
        const data = await soRead(conn);
        if (data.length === 0 || data.toString().trim() === "quit") {
            console.log('end connection');
            break;
        }

        console.log(`data[${data.toString().replace("\n","\\n")}]`);
        await soWrite(conn, data);
    }
}

type TCPListener = {
    socket: net.Server;
    host: String,
    port: String
}

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

function soAccept(listener: TCPListener): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        listener.socket.on("connection", (socket: net.Socket) => resolve(socket));
        listener.socket.on("error", (err: Error) => reject(err));
    });
}

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
