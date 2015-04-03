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

module.exports = function(server, name){
	var channel = new EventEmitter();
	channel.name = name;
	channel.users = {};
	channel.owners = {};
	channel.moderators = {};
	channel.admins = {};
	channel.topic = "";

	channel.toChannel = function(fromUser, obj, type){
		if (fromUser && !fromUser.channels.hasOwnProperty(name)){
			fromUser.writeJSON({type:"error", error:"You are not in this channel."})
			return;
		}

		var keys = Object.keys(channel.admins);
		for (var i = 0; i<keys.length; i++){
			var user = channel.admins[keys[i]];
			if (fromUser && fromUser.ID == user.ID)
				continue;
			user.writeJSON(obj, type);
		}

		keys = Object.keys(channel.owners);
		for (var i = 0; i<keys.length; i++){
			var user = channel.owners[keys[i]];
			if (fromUser && fromUser.ID == user.ID)
				continue;
			user.writeJSON(obj, type);
		}

		keys = Object.keys(channel.moderators);
		for (var i = 0; i<keys.length; i++){
			var user = channel.moderators[keys[i]];
			if (fromUser && fromUser.ID == user.ID)
				continue;
			user.writeJSON(obj, type);
		}

		keys = Object.keys(channel.users);
		for (var i = 0; i<keys.length; i++){
			var user = channel.users[keys[i]];
			if (fromUser && fromUser.ID == user.ID)
				continue;
			user.writeJSON(obj, type);
		}


	};

	channel.joinChannel = function(fromUser, obj, type){
		if (channel.users[fromUser.ID] || channel.moderators[fromUser.ID] || channel.owners[fromUser.ID] || channel.admins[fromUser.ID]){
			// user is already in channel
			fromUser.writeJSON({type:"error", error:"You are already in this channel."});
			return;
		}
		if (fromUser.admin){
			channel.admins[fromUser.ID] = fromUser;
			obj.role = ROLE_ADMIN;
		}
		//else if (fromUser.channelsOwned[name]){
		else if (fromUser.role == ROLE_OWNER){
			fromUser.channelsOwned[name] = true;
			channel.owners[fromUser.ID] = fromUser;
			obj.role = ROLE_OWNER;
		}
		//else if (fromUser.channelsModerated[name]){
		else if (fromUser.role == ROLE_MODERATOR){
			fromUser.channelsModerated[name] = true;
			channel.moderators[fromUser.ID] = fromUser;
			obj.role = ROLE_MODERATOR;
		}
		else{
			channel.users[fromUser.ID] = fromUser;
			obj.role = ROLE_USER;
		}
		fromUser.channels[name] = channel;

		// tell others in channel
		channel.toChannel(fromUser, obj, type);
	};

	channel.leaveChannel = function(fromUser, obj, type){
		if (!channel.users[fromUser.ID]){
			// user is not in channel
			fromUser.writeJSON({type:"error", error:"You are not in this channel."});
			return;
		}

		// tell others in channel
		channel.toChannel(fromUser, obj, type);

		dropUser(channel, fromUser);
	};

	channel.getRoster = function(fromUser, obj, type){
		// tell others in channel
		if (fromUser && !fromUser.channels.hasOwnProperty(name)){
			fromUser.writeJSON({type:"error", error:"You are not in this channel."})
			return;
		}

		var roster = {};
		var o = {type:"roster", channel:name};
		var keys = Object.keys(channel.admins);
		for (var i = 0; i<keys.length; i++){
			var user = channel.admins[keys[i]];
			roster[user.ID] = {name:user.name, role:ROLE_ADMIN};
		}

		keys = Object.keys(channel.owners);
		for (var i = 0; i<keys.length; i++){
			var user = channel.owners[keys[i]];
			roster[user.ID] = {name:user.name, role:ROLE_OWNER};
		}

		keys = Object.keys(channel.moderators);
		for (var i = 0; i<keys.length; i++){
			var user = channel.moderators[keys[i]];
			roster[user.ID] = {name:user.name, role:ROLE_MODERATOR};
		}

		keys = Object.keys(channel.users);
		for (var i = 0; i<keys.length; i++){
			var user = channel.users[keys[i]];
			roster[user.ID] = {name:user.name, role:ROLE_USER};
		}
		
		o.roster = roster;

		fromUser.toUser(fromUser, o, BIG_JSON)
	};

	channel.disconnectUser = function(fromUser){
		channel.toChannel(fromUser, {type:"disconnected", fromUser:fromUser.ID, channel:name}, SYSTEM_JSON);

		dropUser(channel, fromUser);
	};

	channel.banUser = function(byUser, user, reason, time){
		channel.toChannel(null, {type:"banUser", channel:name, user:user.ID, byUser:byUser.ID, reason:reason, time:time}, GAME_JSON);

		dropUser(channel, user);
	};

	channel.muteUser = function(byUser, user, reason, time){
		channel.toChannel(null, {type:"muteUser", channel:name, user:user.ID, byUser:byUser.ID, reason:reason, time:time}, GAME_JSON);
	};

	channel.kickUser = function(byUser, user, reason){
		channel.toChannel(null, {type:"kickUser", channel:name, user:user.ID, byUser:byUser.ID, reason:reason}, GAME_JSON);

		dropUser(channel, user);
	};

	channel.roleChange = function(user, role){

		delete channel.users[user.ID];
		delete channel.owners[user.ID];
		delete channel.moderators[user.ID];
		delete channel.admins[user.ID];

		switch(role){
			case ROLE_ADMIN:
				channel.admins[user.ID] = user;
				break;
			case ROLE_OWNER:
				channel.owners[user.ID] = user;
				break;
			case ROLE_MODERATOR:
				channel.moderators[user.ID] = user;
				break;
			case ROLE_USER:
				channel.users[user.ID] = user;
				break;
		}

		channel.toChannel(null, {type:"roleChange", channel:name, user:user.ID, role:role}, SYSTEM_JSON);
	};

	return channel;
}

function dropUser(channel, user){
	delete channel.users[user.ID];
	delete channel.owners[user.ID];
	delete channel.moderators[user.ID];
	delete channel.admins[user.ID];
	
	delete user.channels[channel.name];
}