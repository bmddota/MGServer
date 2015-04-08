const PING = 0;
const PING_NOCLOSE = 1;
const SYSTEM_JSON = 2;
const SYSTEM_BINARY = 3;
const GAME_JSON = 4;
const GAME_BINARY = 5;
const BIG_JSON = 0xFE00;
const BIG_BINARY = 0xFF00;

var net = require('net');
var sys = require("sys");
var crypto = require("crypto");

var id = parseInt(process.argv[2]);
var name = process.argv[3];

//var HOST = '176.31.182.87';//'127.0.0.1';
//var PORT = 4450;//7123;
var HOST = '127.0.0.1';
var PORT = 7123;
var token = "";

var client = new net.Socket();
client.connect(PORT, HOST, function() {
  console.log('-----CONNECTED TO: ' + HOST + ':' + PORT);

  writeJSON(client, {type:"connect", userID:id, userName:name})
  writeJSON(client, {type:"joinChannel", fromUser:id, channel:"home", name:name});

  var count = 1;
  setInterval(function(){
    writeJSON(client, {type:"msg", fromUser:id, toChannel:"home", msg:"Stress test message: " + count}, GAME_JSON);
    count++;
  }, 10000000);
});

// Add a 'data' event handler for the client socket
// data is what the server sent to this socket
client.on('data', function(data) {
  console.log('DATA: ' + data);
  if (data[1] == 2){
    var str = data.slice(4).toString('utf8');
    var obj = JSON.parse(str);
    if (obj.type == "nonce"){
      var nonce = obj.nonce;
      var hash = crypto.createHash('sha256');
      hash.update(token + str + token);
      var result = hash.digest('hex');

      writeJSON(client, {type:"auth", auth:result});
    }
  }

});

// Add a 'close' event handler for the client socket
client.on('close', function() {
  console.log('Connection closed');
  process.exit();
});

var stdin = process.openStdin();

stdin.addListener("data", function(d) {
    // note:  d is an object, and when converted to a string it will
    // end with a linefeed.  so we (rather crudely) account for that
    // with toString() and then substring()
    var line = d.toString().substring(0, d.length-1);
    var obj = null;
    //console.log("you entered: [" + line  + "]");
    var type = GAME_JSON;//new Buffer([0, 2]);

    var groups = line.match(/\/msg ([^ ]+) (.*)/);
    if (groups){
      var user = parseInt(groups[1]);
      var msg = groups[2];
      obj = {type:"msg", fromUser:id, toUser:user, msg:msg};
      type = GAME_JSON;
    }

    groups = line.match(/\/chan ([^ ]+) (.*)/);
    if (groups){
      var chan = groups[1];
      var msg = groups[2];
      obj = {type:"msg", fromUser:id, toChannel:chan, msg:msg};
      type = GAME_JSON;
    }

    groups = line.match(/\/join (.*)/);
    if (groups){
      var chan = groups[1];
      obj = {type:"joinChannel", fromUser:id, channel:chan, name:name};
      type = SYSTEM_JSON;
    }

    groups = line.match(/\/leave (.*)/);
    if (groups){
      var chan = groups[1];
      obj = {type:"leaveChannel", fromUser:id, channel:chan};
      type = SYSTEM_JSON;
    }

    groups = line.match(/\/roster (.*)/);
    if (groups){
      var chan = groups[1];
      obj = {type:"getRoster", fromUser:id, channel:chan};
      type = SYSTEM_JSON;
    }

    groups = line.match(/\/whois (.*)/);
    if (groups){
      var user = groups[1];
      obj = {type:"whois", fromUser:id, user:user};
      type = GAME_JSON;
    }

    if (obj == null)
      obj = JSON.parse(line);

    writeJSON(client, obj, type);

    //var blen = Buffer.byteLength(line);
    //console.log("blen: " + blen);
    //var buf = new Buffer(line);

    //var sizeBuf = new Buffer(1);

    //client.write(new Buffer([type[0], type[1]]));
    //client.write(new Buffer([blen >> 8, blen % 256]));
    //client.write(buf);
    //client.write(new Buffer([0xFF, 0xFF, 0x00, 0x00]));
    setTimeout(function(){
      //sizeBuf[0] = type[1];
      //client.write(sizeBuf);
      //sizeBuf[0] = blen >> 8;
      //client.write(sizeBuf);
    }, 1000);
    /*setTimeout(function(){
      sizeBuf[0] = blen >> 8;
      client.write(sizeBuf);
    }, 2000);*/
    setTimeout(function(){
      //sizeBuf[0] = blen % 256;
      //client.write(sizeBuf);
    }, 3000);

    setTimeout(function(){
      //sizeBuf[0] = blen % 256;
      //client.write(sizeBuf);
    }, 4000);
    /*var sizeBuf = new Buffer(2);
    sizeBuf[0] = blen >> 8;
    sizeBuf[1] = blen % 256;
    client.write(sizeBuf);
    client.write(buf);*/
  });

function writeJSON(sock, obj, type){
    type = typeof type !== 'undefined' ? type : SYSTEM_JSON;
    var json = JSON.stringify(obj);
    var size = Buffer.byteLength(json);
    var buf = new Buffer(4 + size);
    // SYSTEM_JSON type
    buf[0] = type >> 8;
    buf[1] = type % 256;
    buf[2] = size >> 8;
    buf[3] = size % 256;
    buf.write(json, 4);
    sock.write(buf);
}
// {"type": "LEADERBOARD", "result": "success", "jsonData": data}
// {"type":"LEADERBOARD", "minigameID":"112871c41019e5cbb2fc0e0d08e7d518", "leaderboard":"Ten Invokes"}

//{"type":"SAVE","modID":"70a0be5310f54fa1811657f5d5a0f884","steamID32":68903670,"userName":"BMD","highscoreID":1,"highscoreValue":7410}
//DATA: {"type":"leaderboard","result":"success","jsonData":[{"user_id32":145282485,"highscore_value":-49687},{"user_id32":100683589,"highscore_value":-25974},{"user_id32":55321338,"highscore_value":6151},{"user_id32":16784953,"highscore_value":6780},{"user_id32":102929866,"highscore_value":7656},{"user_id32":189606512,"highscore_value":7685},{"user_id32":119671710,"highscore_value":7704},{"user_id32":88242363,"highscore_value":7817},{"user_id32":68903670,"highscore_value":7888},{"user_id32":38943671,"highscore_value":7919},{"user_id32":201543448,"highscore_value":8135},{"user_id32":62945735,"highscore_value":8367},{"user_id32":101661666,"highscore_value":8517},{"user_id32":17659180,"highscore_value":8546},{"user_id32":89763128,"highscore_value":8561},{"user_id32":50906605,"highscore_value":8672},{"user_id32":97717801,"highscore_value":8717},{"user_id32":32720905,"highscore_value":8719},{"user_id32":199290730,"highscore_value":8760},{"user_id32":212226522,"highscore_value":8801}]}const PING = 0;