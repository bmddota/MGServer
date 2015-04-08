const PING = 0;
const PING_NOCLOSE = 1;
const SYSTEM_JSON = 2;
const SYSTEM_BINARY = 3;
const GAME_JSON = 4;
const GAME_BINARY = 5;
const BIG_JSON = 0xFE00;
const BIG_BINARY = 0xFF00;

const ROLE_USER = 0;
const ROLE_MODERATOR = 2;
const ROLE_OWNER = 3;
const ROLE_ADMIN = 4;

var roleRate = {
  //0:6000.0, 2:8000.0, 3:30000.0, 4:30000.0
  0:6.0, 2:10.0, 3:60.0, 4:60.0
}

var fs = require('fs');
var config = JSON.parse(fs.readFileSync("./config.json", {encoding:'utf8'}));
exports.config = config;

var net = require('net');
var crypto = require('crypto');

var User = require('./User.js');
var Channel = require('./Channel.js');
var game = require('./Game.js');

var users = {};
var channels = {};

var userConfig = game.userConfig; //JSON.parse(fs.readFileSync('users.json').toString());
var ipbans = game.ipbans;

/*fs.watchFile('users.json', function(){
    userConfig = JSON.parse(fs.readFileSync('users.json').toString());    
    console.log("Reloading users.json");
});*/

var server = net.createServer(function (c) {
  var packet = null;
  var size = -1;
  var remaining = 4;
  var packetPosition = -1;
  var header = new Buffer(4);
  var type = -1;
  var destroyOnDrain = false;

  var userID = -1;
  var userName = "";
  var thisUser = null;
  var authed = false;
  var nonce = null;
  var authExpect = null;
  var done = false;
  
  var rate = 6.0;
  var perSeconds = 10.0;
  var allowance = rate;
  var lastMessageTime = Math.floor(Date.now() / 1000)

  c.noClose = false;

  //c.write('hello\r\n');
  //c.setEncoding(null);
  c.setTimeout(60000);
  //c.pipe(c);

  console.log("INITIAL CONNECTION: " + c.remoteAddress + ":" + c.remotePort);
  if (ipbans[c.remoteAddress]){
    console.log ("IP BANNED: " + c.remoteAddress);
    c.destroy();
  }

  c.on('error', function(error){
    console.log('SOCKET ERROR: ' + error.message + " -- " + c.remoteAddress + ":" + c.remotePort + " -- " + userID + " -- " + userName );
    c.destroy();
    //c.end();
  });

  c.on('end', function(){
    console.log('Half closed END:' + c.remoteAddress + ":" + c.remotePort + " -- " + userID + " -- " + userName);
    //c.destroy();
    c.end();
  });

  c.on('packet', function(type, size, packet){
    //console.log("New Packet of type: " + type + " -- size: " + size);
    if (done)
      return;

    if (userID == -1){
      // need to get a SYSTEM_JSON registration
      if (type != SYSTEM_JSON){
        c.writeAndDestroy({error:"Invalid registration command type."});
        return;
      }

      try{
        var json = JSON.parse(packet.toString('utf8'));
      }catch(err){
        c.writeAndDestroy({error:"Invalid json supplied."});
        return;
      }
      if (json.type == null || json.type != "connect" || !json.hasOwnProperty('userID') || !json.hasOwnProperty('userName') || json.userName == ""
        || typeof json.userID != "number" || typeof json.userName != "string"){
        c.writeAndDestroy({error:"Invalid registration json type."});
        return;
      }

      if (json.userID == 0){
        c.writeAndDestroy({error:"Unable to connect.."});
        return;
      }
      
      userID = json.userID;
      userName = json.userName;

      if (users.hasOwnProperty(userID)){
        if (users[userID].authed){
          c.writeAndDestroy({error:"Authed user is already connected."});
        }
        else{
          var user = users[userID];
          user.disconnect();
          delete users[userID];
          user.socket.noClose = true;
          user.socket.writeAndDestroy({error:"Duplicate user has connected."});
        }
      }
      console.log("SUCCESSFULLY CONNECTED: " + c.remoteAddress + ":" + c.remotePort + " -- " + json.userID + " -- " + json.userName)
      thisUser = User(server, c, userID, userName);
      users[userID] = thisUser;

      if (userConfig.hasOwnProperty(userID)){
        nonce = crypto.pseudoRandomBytes(8).toString('hex');      
        var nonceStr = '{"type":"nonce","nonce":"' + nonce + '"}';
        var hash = crypto.createHash('sha256');
        hash.update(userConfig[userID].token + nonceStr + userConfig[userID].token);

        authExpect = hash.digest('hex') 
        c.writeJSON(nonceStr);
      }

      if (!game.connected(thisUser, json, type))
        done = true;
      return;
    }

    // rate management
    var now = Math.floor(Date.now() / 1000)
    var delta = now - lastMessageTime;
    lastMessageTime = now;
    allowance += delta * (rate / perSeconds);
    if (allowance > rate){
      allowance = rate;
    }
    else if (allowance < 1.0){
      c.writeAndDestroy({error:"Message Rate Limit exceeded."});
      return;
    }
    
    allowance -= 1.0;

    switch(type){
      case SYSTEM_JSON:
        console.log("SYSTEM_JSON: " + packet.toString('utf8'));
        try{
          var json = JSON.parse(packet.toString('utf8'));
        }catch(err){
          c.writeAndDestroy({error:"Invalid json supplied."});
          return;
        }

        if (json == null || json.type == null){
          c.writeAndDestroy({error:"No json type specified."});
          return;
        }

        switch(json.type){
          case "auth":
            if (typeof json.auth != "string"){
              c.writeAndDestroy({error:"Auth failure."});
            }
            else if (authExpect == json.auth){
              console.log("AUTH SUCCESS");
              var role = userConfig[userID].role;
              users[userID].auth(role);
              rate = roleRate[role];
              allowance = rate;

              c.writeJSON({type:"authSuccess"});
            }
            else{
              c.writeAndDestroy({error:"Auth failure."});
            }
            break;
          case "joinChannel":
            if (typeof json.channel != "string" || json.fromUser != userID)
              c.writeJSON({type:"error", error:"Invalid joinChannel request."});
            else
            {
              if (!channels[json.channel]){
                channels[json.channel] = Channel(server, json.channel);
              }
              var channel =channels[json.channel];

              json.name = users[json.fromUser].name;

              channel.joinChannel(thisUser, json, type);
            }
            break;
          case "leaveChannel":
            if (typeof json.channel != "string" || json.fromUser != userID)
              c.writeJSON({type:"error", error:"Invalid leaveChannel request."});
            else
            {
              var channel =channels[json.channel];
              if (!channel)
                c.writeJSON({type:"error", error:"Channel does not exist."});
              else
                channel.leaveChannel(thisUser, json, type);
            }
            break;
          case "getRoster":
            if (typeof json.channel != "string" || json.fromUser != userID)
              c.writeJSON({type:"error", error:"Invalid getRoster request."});
            else
            {
              var channel =channels[json.channel];
              if (!channel)
                c.writeJSON({type:"error", error:"Channel does not exist."});
              else
                channel.getRoster(thisUser, json, type);
            }
            break;
          case "disconnect":
            c.writeAndDestroy({type:"close"});
            break;

        }

        break;
      case GAME_JSON:
        console.log("GAME JSON: " + packet.toString('utf8'));
        try{
          var json = JSON.parse(packet.toString('utf8'));
        }catch(err){
          c.writeAndDestroy({error:"Invalid json supplied."});
          return;
        }

        if (json.type == null){
          c.writeAndDestroy({error:"No json type specified."});
          return;
        }

        if (json.fromUser && json.fromUser != userID){
          c.writeJSON({type:"error", error:"Invalid user."});
          return;
        }

        game.message(thisUser, json, type);

        break;
      case GAME_BINARY:
        console.log("GAME BINARY: " + packet);
        break;

      case SYSTEM_BINARY:
        console.log("DONT SEND SYSTEM_BINARY");
        break;
      case PING:
        console.log('PING SOMEHOW GOT THROUGH TO HERE');
        break;
      case PING_NOCLOSE:
        console.log("PING_NOCLOSE SOMEHOW HERE");
        break;
    }
  });

  c.on('drain', function(){
    console.log('drain, destroy: ' + destroyOnDrain);
    if (destroyOnDrain)
      c.end();
  });

  c.on('data', function(data){
    while (data.length != 0){
      //console.log('dlen: ' + data.length);

      if (packet == null){
        if (data.length < remaining){
          //console.log(data.length + ' byte length seen -- need: ' + remaining);
          data.copy(header, 4 - remaining, 0, remaining);
          remaining -= data.length;
          return;
        }

        if (remaining == 3){
          type = (header[0] << 8) + data[0];
          size = (data[1] << 8) + data[2];
          data = data.slice(3);
        }
        else if (remaining == 2){
          type = (header[0] << 8) + header[1];
          size = (data[0] << 8) + data[1];
          data = data.slice(2);
        }
        else if (remaining == 1){
          type = (header[0] << 8) + header[1];
          size = (header[2] << 8) + data[0];
          data = data.slice(1);
        }
        else{
          type = (data[0] << 8) + data[1];
          size = (data[2] << 8) + data[3];
          data = data.slice(4);
        }

        if (type == PING){
          //console.log("PING received, sending PONG")
          c.writeAndDestroy(new Buffer([0,0,0,0]));
          return;
        }

        if (type == PING_NOCLOSE){
          if (userID == -1){
            c.writeAndDestroy({error:"Invalid registration command type."});
            return;
          }
          //console.log("PING_NOCLOSE received, sending PONG")
          var newBuf = new Buffer([0x00, 0x01, 0x00, 0x00]);
          c.write(newBuf);
          remaining = 4;
          packet = null;
          continue;
        }

        // including both to maybe allow for them by configuration later
        if (type >= BIG_JSON || type >= BIG_BINARY){
          console.log("BIG_JSON/BINARY received, closing")
          c.writeAndDestroy({error:"Server does not accept BIG_JSON/BIG_BINARY"})
          return;
        }

        //console.log('type: ' + type);
        //console.log('size: ' + size);
        remaining = size;
        packet = new Buffer(size);
        packetPosition = 0;
        //console.log('new packet');
      }
      else{
        var dlen = data.length;
        //console.log('dlen: ' + dlen + ' -- remain: ' + remaining);
        if (dlen >= remaining){
          data.copy(packet, packetPosition, 0, remaining);
          data = data.slice(remaining, dlen);
          packetPosition += remaining;

          // EMIT HERE
          //console.log('packet: ' + packet.toString('utf8'));
          //console.log('===========');
          remaining = 4;
          c.emit('packet', type, size, packet);
          packet = null;
        }
        else{
          data.copy(packet, packetPosition, 0, dlen);
          data = new Buffer(0);
          packetPosition += dlen;
          remaining -= dlen;
          //console.log('partial: ' + packet.toString('utf8'));
          //console.log('remaining: ' + remaining);
          //console.log('---------');
        }
      }
    }
  });

  c.on('timeout', function(){
    console.log('timeout' + userID);
    c.writeAndDestroy({error:"Connection timed out."})
  });

  c.on('close', function(){
    if (userID == -1 || c.noClose)
      return;
    console.log('close ' + userID);
    //console.log(Object.keys(users));

    if (users[userID] != null){
        users[userID].disconnect();
        delete users[userID];
    }

    //console.log(Object.keys(users));
  });

  c.writeAndDestroy = function (buf, type){
    if (!Buffer.isBuffer(buf)){
      type = typeof type !== 'undefined' ? type : SYSTEM_JSON;
      buf.type = "close";
      var json = JSON.stringify(buf);
      var size = Buffer.byteLength(json);
      var newBuf = new Buffer(4 + size);
      newBuf[0] = type >>> 8;
      newBuf[1] = type & 0xFF;
      newBuf[2] = size >>> 8;
      newBuf[3] = size & 0xFF;
      newBuf.write(json, 4);
      buf = newBuf
    }
    if (c.write(buf))
      c.end();
    else
      c.destroyOnDrain = true;
  };

  c.writeJSON = function(obj, type){
    type = typeof type !== 'undefined' ? type : SYSTEM_JSON;
    var json = typeof obj === 'string' ? obj : JSON.stringify(obj);
    var size = Buffer.byteLength(json);
    var buf = new Buffer(4 + size);
    if (type >= BIG_JSON){
      buf[0] = type >>> 8;
      buf[1] = size >>> 16;
      buf[2] = (size >>> 8) & 0xFF;
      buf[3] = size & 0xFF;
    }
    else{
      buf[0] = type >>> 8;
      buf[1] = type & 0xFF;
      buf[2] = size >>> 8;
      buf[3] = size & 0xFF;
    }
    buf.write(json, 4);
    c.write(buf);
  };
});

server.users = users;
server.channels = channels;
server.listen(config.port);

process.on( 'SIGINT', function() {
  console.log( "\nGracefully shutting down from SIGINT (Ctrl-C)" );
  // some other closing procedures go here
  var keys = Object.keys(users);
  for (var i = 0; i<keys.length; i++){
    var user = users[keys[i]];
    user.writeAndDestroy({error:"Server is restarting."})
  }

  process.exit( );
});

exports.config = config;
exports.users = users;
exports.channels = channels;
exports.server = server;