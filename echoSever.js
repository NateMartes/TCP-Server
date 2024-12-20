/*
 * Author: Nathaniel Martes
 * Description:
 *   Creates a simple TCP Echo sever, running on 127.0.0.1:1234
 */
import * as net from "net";

function newConnection(socket) {
    console.log("new connection", socket.remoteAddress, socket.remotePort);
    
    socket.on('end', () => {
        console.log("EOF.");
    });

    socket.on('data', (data) => {
        console.log("data :", data.ToString());
        if (data.includes('q')) {
            console.log('closing connection.');
            socket.end();
        } else {
            socket.write(data);
        }
    });
}
let server = net.createServer();

//Once a connection has been made to the server, call newConnection (a callback if you will)
server.on("connection", newConnection);

//Error Handling
server.on("error", (err) => {throw err});

// Creates Listening Socket on 127.0.0.1:1234
server.listen({
    host: '127.0.0.1',
    port: 1234
}, () => {
    console.log("Server is listening on 127.0.0.1:1234");
});




