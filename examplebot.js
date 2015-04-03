const PING = 0;
const PING_NOCLOSE = 1;
const SYSTEM_JSON = 2;
const SYSTEM_BINARY = 3;
const GAME_JSON = 4;
const GAME_BINARY = 5;
const BIG_JSON = 0xFE00;
const BIG_BINARY = 0xFF00;

var id = 123456789;
var name = "BotName";

var HOST = '127.0.0.1';
var PORT = 7123;
var token = ""; // Generate a token for a specific authorized role if needed

var sys = require('sys');
var client = require('./mgclient.js')();

client.on('connect', function(){
	console.log('connect success');
	
	// joins the channel "home"
	//client.writeJSON({type:"joinChannel", fromUser:id, channel:'home', name:name}, client.SYSTEM_JSON);
	
	// gets the roster for channel "home"
	//client.writeJSON({type:"getRoster", fromUser:id, channel:'home'}, client.SYSTEM_JSON);
});

client.on('gameJson', function(obj, type){
  // Handler for all GAME_JSON type messages coming in including directed "msg" types
	if (obj.type == "msg" && obj.toUser == id){
		
    // Print raw message
    //console.log(type + " -- " + JSON.stringify(obj));

    // Print just the feedback and user
    console.log("Feedback from [" + obj.fromUser + "] -- " + obj.msg);

		client.writeJSON({type:"msg", toUser:obj.fromUser, fromUser:id, msg:"Thanks for your feedback."}, client.GAME_JSON);
	}
});

client.connect(HOST, PORT, id, name, token);