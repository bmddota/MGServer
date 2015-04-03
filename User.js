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

module.exports = function(server, socket, userID, name){
	var user = new EventEmitter();
	user.socket = socket;
	user.name = name;
	user.ID = userID;
	user.admin = false;
	user.authed = false;
	user.channelsOwned = {};
	user.channelsModerated = {};
	user.channels = {};
	user.role = ROLE_USER;

	user.toUser = function(fromUser, obj, type){
		socket.writeJSON(obj, type);
	};

	user.disconnect = function(){
		var keys = Object.keys(user.channels);
		for (var i=0; i<keys.length; i++){
			var chan = user.channels[keys[i]];
			chan.disconnectUser(user);
		}
	};

	user.ban = function(byUser, reason, time){
		var keys = Object.keys(user.channels);
		for (var i=0; i<keys.length; i++){
			var chan = user.channels[keys[i]];
			chan.banUser(byUser, user, reason, time);
		}

		user.writeAndDestroy({error:"You have been banned."});
	};

	user.mute = function(byUser, reason, time){
		var keys = Object.keys(user.channels);
		for (var i=0; i<keys.length; i++){
			var chan = user.channels[keys[i]];
			chan.muteUser(byUser, user, reason, time);
		}
	};

	user.kick = function(byUser, reason){
		var keys = Object.keys(user.channels);
		for (var i=0; i<keys.length; i++){
			var chan = user.channels[keys[i]];
			chan.kickUser(byUser, user, reason);
		}
		user.writeAndDestroy({error:"You have been kicked."});
	};

	user.roleChange = function(role, channel){
		user.role = role;
		switch(role){
			case ROLE_ADMIN:
				user.admin = true;
				break;
			case ROLE_OWNER:
				user.channelsOwned[channel] = true;
				break;
			case ROLE_MODERATOR:
				user.channelsModerated[channel] = true;
				break;
		}

		var chan = user.channels[channel];
		if (chan)
			chan.roleChange(user, role);

		/*var keys = Object.keys(user.channels);
		for (var i=0; i<keys.length; i++){
			var chan = user.channels[keys[i]];
			chan.roleChange(user, role);
		}*/
	};

	user.auth = function(role, channel){
		if (channel == null)
			channel = "home"
		user.authed = true;
		user.roleChange(role, channel);
		
	};

	user.writeJSON = socket.writeJSON;
	user.writeAndDestroy = socket.writeAndDestroy;


	return user;
}