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

var EventEmitter = require('events').EventEmitter;
var net = require('net');
var crypto = require("crypto");

module.exports = function(){
  var client = new EventEmitter();
  var pingSendTime = 0;

  client.connect = function(host, port, id, userName, authToken){
    client.socket = new net.Socket();
    var socket = client.socket;
    var socketReady = false;
    client.host = host;
    client.port = port;
    client.id = id;
    client.userName = userName;
    client.authToken = authToken;
    client.pingTimer = null;
      
    var curPing = -1;
    var nonceStr = null;
    var newPacket = true;

    var remaining = 4;
    var type = -1;
    var packet = null;
    var size = -1;
    var header = new Buffer(4);
    var packetPosition = 0;

    socket.connect(port, host, function() {
      socketReady = true;
      
      client.writeJSON({type:"connect", userID:id, userName:userName}, SYSTEM_JSON);
      client.write(new Buffer(0), PING_NOCLOSE);
      
      client.pingTimer = setInterval(function(){
        if (socketReady){
          client.write(new Buffer(0), PING_NOCLOSE);
        }
        else{
          clearInterval(client.pingTimer);
        }
      },20000);

      socket.on('packet',function(type, size, data){
        var json;
        var obj;
        
        switch(type){
          case PING:
            curPing = Date.now() - pingSendTime;
            return;
            break;
          case PING_NOCLOSE:
            curPing = Date.now() - pingSendTime;
            return;
            break;
          
          case SYSTEM_JSON:
            json = data.toString('utf8');
            obj = JSON.parse(json);

            console.log('json: ' + json);
            
            if (obj.hasOwnProperty("type")){
              switch(obj.type){
                case "close":
                  client.close();
                  client.emit('closed', obj, type);
                  break;
                case "error":
                  client.emit('errorMessage', obj, type);
                  break;
                case "disconnected":
                  client.emit('userDisconnected', obj, type);
                  break;
                case "joinChannel":
                  client.emit('userJoinChannel', obj, type);
                  break;
                case "leaveChannel":
                  client.emit('userLeaveChannel', obj, type);
                  break;
                case "authSuccess":
                  client.emit('authSuccess', obj, type);
                  break;
                case "roleChange":
                  client.emit('roleChange', obj, type);
                  break;
                case "nonce":
                  nonceStr = json;
                  if (authToken != null){
                    var hash = crypto.createHash('sha256');
                    hash.update(authToken + nonceStr + authToken);
                    client.writeJSON({type:"auth", auth:hash.digest('hex')}, SYSTEM_JSON);
                  }
                  break;
              }
            }
            
            break;
          case GAME_JSON:
            json = data.toString('utf8');
            obj = JSON.parse(json);
            client.emit('gameJson', obj, type);
            break;
          case BIG_JSON:
            json = data.toString('utf8');
            obj = JSON.parse(json);
            client.emit('gameJson', obj, type);
            break;
          
          case SYSTEM_BINARY:
            //client.emit('binary', obj, type);
            break;
          case GAME_BINARY:
            client.emit('binary', obj, type);
            break;
          case BIG_BINARY:
            client.emit('binary', obj, type);
            break;
        }
      });

      socket.on('data', function(data){
        while (data.length != 0){

          if (packet == null){
            if (data.length < remaining){
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

            remaining = size;
            packet = new Buffer(size);
            packetPosition = 0;
          }
          else{
            var dlen = data.length;
            if (dlen >= remaining){
              data.copy(packet, packetPosition, 0, remaining);
              data = data.slice(remaining, dlen);
              packetPosition += remaining;

              // EMIT HERE
              remaining = 4;
              socket.emit('packet', type, size, packet);
              packet = null;
            }
            else{
              data.copy(packet, packetPosition, 0, dlen);
              data = new Buffer(0);
              packetPosition += dlen;
              remaining -= dlen;
            }
          }
        }
      });
      
      client.emit('connect');
    });
  };

  client.writeJSON = function(obj, type){
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
    client.socket.write(buf);
  };

  client.write = function(buffer, type){
    type = typeof type !== 'undefined' ? type : SYSTEM_JSON;
    var size = buffer.length
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

    if (type == PING || type == PING_NOCLOSE){
      pingSendTime = Date.now();
    }
    buffer.copy(buf, 4);
    client.socket.write(buf);
  };

  client.close = function(){
    if (client.pingTimer != null)
      clearInterval(client.pingTimer);

    client.socket.end();
  };

  client.getPing = function(){
    return curPing;
  };

  client.PING = PING;
  client.PING_NOCLOSE = PING_NOCLOSE;
  client.SYSTEM_JSON = SYSTEM_JSON;
  client.SYSTEM_BINARY = SYSTEM_BINARY;
  client.GAME_JSON = GAME_JSON;
  client.GAME_BINARY = GAME_BINARY;
  client.BIG_JSON = BIG_JSON;
  client.BIG_BINARY = BIG_BINARY;

  client.ROLE_USER = ROLE_USER;
  client.ROLE_MODERATOR = ROLE_MODERATOR;
  client.ROLE_OWNER = ROLE_OWNER;
  client.ROLE_ADMIN = ROLE_ADMIN;
  return client;
}