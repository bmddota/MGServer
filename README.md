# MGServer
MG Server written in Node for facilitating simple message passing in binary/json messages.

To run this server you need to install node and optionally redis (redis is necessary for persisting user tokens/ban lists/etc).
You can configure the port used by the server and whether it should use redis at all in config.json.

To launch the server, execute "node mgserver.js"

To launch the examplebot, execute "node examplebot.js" after the server is running.
The example bot connects to the server without joining any channels, then prints any private messages received as feedback to the console.