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

var mgserver = require('./mgserver.js');
var redis = require('redis');
var fs = require('fs');
var client;
var game = {};

var config = mgserver.config;
if (config.redis){
	client = redis.createClient();
}

//client.hmset("userTokens", JSON.parse(fs.readFileSync('users.json').toString()));
//client.hmset("userRoles", JSON.parse(fs.readFileSync('users.json').toString()));

var mutelist = {}, banlist = {}, baninfo = {}, muteinfo = {}, userConfig = {}, ipbanlist = {}, ipbaninfo = {}, ipbans = {};
var ipbanindex = 1;
game.userConfig = userConfig;
game.ipbans = ipbans;

if (config.redis){
	client.hgetall("mutelist", function(err, obj){
		mutelist = obj;
		if (!mutelist)
			mutelist = {};
	});
	client.hgetall("muteinfo", function(err, obj){
		muteinfo = obj;
		if (!muteinfo)
			muteinfo = {};
	});
	client.hgetall("banlist", function(err, obj){
		banlist = obj;
		if (!banlist)
			banlist = {};
	});
	client.hgetall("baninfo", function(err, obj){
		baninfo = obj;
		if (!baninfo)
			baninfo = {};
	});
	client.hgetall("ipbanlist", function(err, obj){
		ipbanlist = obj;
		if (!ipbanlist)
			ipbanlist = {};

		var keys = Object.keys(ipbanlist);
		for (var i = 0; i<keys.length; i++){
			var key = keys[i];
			ipbans[ipbanlist[key]] = true;
		}
	});
	client.hgetall("ipbaninfo", function(err, obj){
		ipbaninfo = obj;
		if (!ipbaninfo)
			ipbaninfo = {};
	});
	client.get("ipbanindex", function(err, obj){
		ipbanindex = obj;
		if (!ipbanindex){
			ipbanindex = 1;
			client.set("ipbanindex", "1");
		}
	});
	client.hgetall("userTokens", function(err, obj){
		if (obj){
			var keys = Object.keys(obj);
			for (var i = 0; i<keys.length; i++){
				var key = keys[i];
				if (userConfig[key])
					userConfig[key].token = obj[key];
				else
					userConfig[key] = {token:obj[key]};
			}
		}

		game.userConfig = userConfig;
	});
	client.hgetall("userRoles", function(err, obj){
		if (obj){
			var keys = Object.keys(obj);
			for (var i = 0; i<keys.length; i++){
				var key = keys[i];
				if (userConfig[key])
					userConfig[key].role = Number(obj[key]);
				else
					userConfig[key] = {role:Number(obj[key])};
			}
		}

		game.userConfig = userConfig;
	});


	setInterval(function(){
		client.exists("reloadtokens", function(err, obj){
			if (obj && (obj == 1 || obj == true)){
				console.log("RELOADING TOKENS");
				client.del("reloadtokens");

				client.hgetall("userTokens", function(err, obj){
					if (obj){
						var keys = Object.keys(obj);
						for (var i = 0; i<keys.length; i++){
							var key = keys[i];
							if (userConfig[key])
								userConfig[key].token = obj[key];
							else
								userConfig[key] = {token:obj[key]};
						}
					}

					game.userConfig = userConfig;
				});
				client.hgetall("userRoles", function(err, obj){
					if (obj){
						var keys = Object.keys(obj);
						for (var i = 0; i<keys.length; i++){
							var key = keys[i];
							if (userConfig[key])
								userConfig[key].role = Number(obj[key]);
							else
								userConfig[key] = {role:Number(obj[key])};
						}
					}

					game.userConfig = userConfig;
				});
			}
		});
	}, 5000)
}

var EventEmitter = require('events').EventEmitter;

game.connected = function(fromUser, obj, type){
	var banned = banlist[fromUser.ID];
	if (banned){
		var now = Date.now();
		if (banned > now){
			fromUser.writeAndDestroy({error:"You have been banned.  Your ban will be lifted in " + msToStringTime(banned - now) + "."});
			return false;
		}

		delete banlist[fromUser.ID];
		delete baninfo[fromUser.ID];
		if (config.redis){
			client.hdel("banlist", fromUser.ID);
			client.hdel("baninfo", fromUser.ID);
		}
	}
	return true;
};

game.message = function(fromUser, obj, type){
	switch(obj.type){
		case "whois":
			var user = mgserver.users[obj.user];
			if (!user){
				fromUser.writeJSON({type:"error", error:"User not found."});
				return;
			}

			var whois = {type:"whois"};
			switch(fromUser.role){
				case ROLE_ADMIN:
				case ROLE_OWNER:
				case ROLE_MODERATOR:
					whois.channels = Object.keys(user.channels).join(",");
				case ROLE_USER:
					whois.ID = user.ID;
					whois.authed = user.authed;
					whois.role = user.role;
					whois.name = user.name;
					break;
			}

			fromUser.writeJSON(whois, GAME_JSON);
			break;

		case "ipbanList":
			if (!checkRole(fromUser, ROLE_OWNER))
				return;

			fromUser.writeJSON({type:"ipbanList", ipbanList:ipbaninfo}, GAME_JSON);
			break;
		case "banList":
			if (!checkRole(fromUser, ROLE_MODERATOR))
				return;

			var bans = {};
			var keys = Object.keys(banlist);
			var now = Date.now();
			for (var i = 0; i<keys.length; i++){
				var key = keys[i];
				var banned = banlist[key] - now;
				if (banned > 0){
					bans[key] = msToStringTime(banned) + " - " + baninfo[key];
				}
				else{
					delete banlist[key];
					delete baninfo[key];
					if (config.redis){
						client.hdel("banlist", key);
						client.hdel("baninfo", key);
					}
				}
			}

			fromUser.writeJSON({type:"banList", banList:bans}, GAME_JSON);
			break;
		case "muteList":
			if (!checkRole(fromUser, ROLE_MODERATOR))
				return;	

			var muteds = {};
			var keys = Object.keys(mutelist);
			var now = Date.now();
			for (var i = 0; i<keys.length; i++){
				var key = keys[i];
				var muted = mutelist[key] - now;
				if (muted > 0){
					muteds[key] = msToStringTime(muted) + " - " + muteinfo[key];
				}
				else{
					delete mutelist[key];
					delete muteinfo[key];
					if (config.redis){
						client.hdel("mutelist", key);
						client.hdel("muteinfo", key);
					}
				}
			}

			fromUser.writeJSON({type:"muteList", muteList:muteds}, GAME_JSON);
			break;

		case "kickUser":
			if (!checkRole(fromUser, ROLE_MODERATOR))
				return;

			var user = mgserver.users[obj.user];
			if (!user || !checkRole(fromUser, user.role + 1))
				return;

			fs.appendFile('modlog.log', '[' + new Date().toISOString() + '] ' + user.name + '@' + user.ID + ' KICKED by ' + fromUser.name + '@' + fromUser.ID + ' for ' + obj.reason + "\n", 
				function (err) {  if (err) console.log("Unable to append modlog: " + err); });
			user.kick(fromUser, obj.reason);

			break;

		case "banUser":
			if (!checkRole(fromUser, ROLE_MODERATOR))
				return;

			var user = mgserver.users[obj.user];
			if (!user || !checkRole(fromUser, user.role + 1))
				return;

			var banned = Date.now() + obj.time;
			banlist[user.ID] = banned;
			baninfo[user.ID] = user.name + " -- " + obj.reason;
			if (config.redis){
				client.hset("banlist", user.ID, banned);
				client.hset("baninfo", user.ID, baninfo[user.ID]);
			}

			fs.appendFile('modlog.log', '[' + new Date().toISOString() + '] ' + user.name + '@' + user.ID + ' BANNED by ' + fromUser.name + '@' + fromUser.ID + ' for ' + msToStringTime(obj.time) + ' -- ' + obj.reason + "\n", 
				function (err) {  if (err) console.log("Unable to append modlog: " + err); });
			user.ban(fromUser, obj.reason, obj.time);

			break;
		case "unbanUser":
			if (!checkRole(fromUser, ROLE_MODERATOR))
				return;

			if (!banlist[obj.user]){
				fromUser.writeJSON({type:"error", error:"User not currently banned."});
				return;
			}

			delete banlist[obj.user];
			delete baninfo[obj.user];
			if (config.redis){
				client.hdel("banlist", obj.user);
				client.hdel("baninfo", obj.user);
			}

			fs.appendFile('modlog.log', '[' + new Date().toISOString() + '] ' + obj.user + ' unbanned by ' + fromUser.name + '@' + fromUser.ID + "\n", 
				function (err) {  if (err) console.log("Unable to append modlog: " + err); });
			fromUser.writeJSON({type:"info", msg:"User successfully unbanned."}, GAME_JSON);

			break;

		case "muteUser":
			if (!checkRole(fromUser, ROLE_MODERATOR))
				return;

			var user = mgserver.users[obj.user];
			if (!user || !checkRole(fromUser, user.role + 1))
				return;

			var muted = Date.now() + obj.time;
			mutelist[user.ID] = muted;
			muteinfo[user.ID] = user.name + " -- " + obj.reason;
			if (config.redis){
				client.hset("mutelist", user.ID, muted);
				client.hset("muteinfo", user.ID, muteinfo[user.ID]);
			}

			fs.appendFile('modlog.log', '[' + new Date().toISOString() + '] ' + user.name + '@' + user.ID + ' MUTED by ' + fromUser.name + '@' + fromUser.ID + ' for ' + msToStringTime(obj.time) + ' -- ' + obj.reason + "\n", 
				function (err) {  if (err) console.log("Unable to append modlog: " + err); });
			user.mute(fromUser, obj.reason, obj.time);

			break;
		case "warnUser":
			if (!checkRole(fromUser, ROLE_MODERATOR))
				return;


			var user = mgserver.users[obj.user];
			if (!user || !checkRole(fromUser, user.role + 1))
				return;

			var channel = mgserver.channels[obj.toChannel];
      if (!channel){
        fromUser.writeJSON({type:"error", error:"Channel not found."});
        return;
      }

      channel.toChannel(null, obj, type);

			break;
		case "unmuteUser":
			if (!checkRole(fromUser, ROLE_MODERATOR))
				return;

			if (!mutelist[obj.user]){
				fromUser.writeJSON({type:"error", error:"User not currently muted."});
				return;
			}

			delete mutelist[obj.user];
			delete muteinfo[obj.user];
			if (config.redis){
				client.hdel("mutelist", obj.user);
				client.hdel("muteinfo", obj.user);
			}

			var user = mgserver.users[obj.user];
			if (user){
				user.writeJSON({type:"info", msg:"You have been unmuted."}, GAME_JSON);
			}

			fs.appendFile('modlog.log', '[' + new Date().toISOString() + '] ' + obj.user + ' unmuted by ' + fromUser.name + '@' + fromUser.ID + "\n", 
				function (err) {  if (err) console.log("Unable to append modlog: " + err); });
			fromUser.writeJSON({type:"info", msg:"User successfully unmuted."}, GAME_JSON);
			break;

		case "ipbanUser":
			if (!checkRole(fromUser, ROLE_OWNER))
				return;

			var user = mgserver.users[obj.user];
			if (!user || !checkRole(fromUser, user.role + 1))
				return;

			var ip = user.socket.remoteAddress;
			ipbans[ip] = true;
 			ipbanlist[ipbanindex] = ip;
			ipbaninfo[ipbanindex] = user.name + "@" + user.ID + " -- " + obj.reason;
			if (config.redis){
				client.hset("ipbanlist", ipbanindex, ip);
				client.hset("ipbaninfo", ipbanindex, ipbaninfo[ipbanindex]);
				client.incr("ipbanindex");
			}
			ipbanindex++;

			fs.appendFile('modlog.log', '[' + new Date().toISOString() + '] ' + user.name + '@' + user.ID + ' ' + ip + ' IP Banned by ' + fromUser.name + '@' + fromUser.ID + ' for ' + obj.reason + "\n", 
				function (err) {  if (err) console.log("Unable to append modlog: " + err); });
			user.kick(fromUser, obj.reason);

			break;
		case "unipbanUser":
			if (!checkRole(fromUser, ROLE_OWNER))
				return;

			if (!ipbanlist[obj.index]){
				fromUser.writeJSON({type:"error", error:"No IP Ban found for this index."});
				return;
			}

			fs.appendFile('modlog.log', '[' + new Date().toISOString() + '] ' + ipbanlist[obj.index] + ' IP ban lifed by ' + fromUser.name + '@' + fromUser.ID + "\n", 
				function (err) {  if (err) console.log("Unable to append modlog: " + err); });

			delete ipbans[ipbanlist[obj.index]];
			delete ipbanlist[obj.index];
			delete ipbaninfo[obj.index];
			if (config.redis){
				client.hdel("ipbanlist", obj.index);
				client.hdel("ipbaninfo", obj.index);
			}

			fromUser.writeJSON({type:"info", msg:"IP Ban successfully lifted."}, GAME_JSON);

			break;

		case "modUser":
			if (!checkRole(fromUser, ROLE_OWNER))
				return;

			var user = mgserver.users[obj.user];
			if (!user){
				if (userConfig[obj.user] != null){
					if (userConfig[obj.user].role >= ROLE_MODERATOR){
						user.writeJSON({type:"error", error:"User already has moderator privilege."});
						return;
					}
					if (config.redis){
						client.hset("userRoles", obj.user, ROLE_MODERATOR);
					}
					userConfig[obj.user].role = ROLE_MODERATOR;
					fromUser.writeJSON({type:"info", msg:"User is now a moderator."}, GAME_JSON);
				}
				return;
			}

			if (user.role >= ROLE_MODERATOR){
				fromUser.writeJSON({type:"error", error:"User already has moderator privilege."});
				return;
			}

			if (userConfig[user.ID] != null){	
				if (config.redis){
					client.hset("userRoles", user.ID, ROLE_MODERATOR);
				}
				userConfig[user.ID].role = ROLE_MODERATOR;
			}
			user.roleChange(ROLE_MODERATOR, obj.channel);
			fromUser.writeJSON({type:"info", msg:"User is now a moderator."}, GAME_JSON);

			break;
		case "unmodUser":
			if (!checkRole(fromUser, ROLE_OWNER))
				return;

			var user = mgserver.users[obj.user];
			if (!user){
				if (userConfig[obj.user] != null){
					if (userConfig[obj.user].role != ROLE_MODERATOR){
						user.writeJSON({type:"error", error:"User is not a moderator."});
						return;
					}
					if (config.redis){
						client.hset("userRoles", obj.user, ROLE_USER);
					}
					userConfig[obj.user].role = ROLE_USER;
					fromUser.writeJSON({type:"info", msg:"User is no longer a moderator."}, GAME_JSON);
				}
				return;
			}

			if (user.role != ROLE_MODERATOR){
				fromUser.writeJSON({type:"error", error:"User is not a moderator."});
				return;
			}

			if (userConfig[user.ID] != null){	
				if (config.redis){
					client.hset("userRoles", user.ID, ROLE_USER);
				}
				userConfig[user.ID].role = ROLE_USER;
			}
			user.roleChange(ROLE_USER, obj.channel);
			fromUser.writeJSON({type:"info", msg:"User is no longer a moderator."}, GAME_JSON);

			break;

		case "ownUser":
			if (!checkRole(fromUser, ROLE_ADMIN))
				return;

			var user = mgserver.users[obj.user];
			if (!user){
				if (userConfig[obj.user] != null){
					if (userConfig[obj.user].role >= ROLE_OWNER){
						user.writeJSON({type:"error", error:"User already has owner privilege."});
						return;
					}
					if (config.redis){
						client.hset("userRoles", obj.user, ROLE_OWNER);
					}
					userConfig[obj.user].role = ROLE_OWNER;
					fromUser.writeJSON({type:"info", msg:"User is now an owner."}, GAME_JSON);
				}
				return;
			}

			if (user.role >= ROLE_OWNER){
				fromUser.writeJSON({type:"error", error:"User already has owner privilege."});
				return;
			}

			if (userConfig[user.ID] != null){	
				if (config.redis){
					client.hset("userRoles", user.ID, ROLE_OWNER);
				}
				userConfig[user.ID].role = ROLE_OWNER;
			}
			user.roleChange(ROLE_OWNER, obj.channel);
			fromUser.writeJSON({type:"info", msg:"User is now an owner."}, GAME_JSON);

			break;
		case "unownUser":
			if (!checkRole(fromUser, ROLE_ADMIN))
				return;

			var user = mgserver.users[obj.user];
			if (!user){
				if (userConfig[obj.user] != null){
					if (userConfig[obj.user].role != ROLE_OWNER){
						user.writeJSON({type:"error", error:"User is not an owner."});
						return;
					}
					if (config.redis){
						client.hset("userRoles", obj.user, ROLE_USER);
					}
					userConfig[obj.user].role = ROLE_USER;
					fromUser.writeJSON({type:"info", msg:"User is no longer an owner."}, GAME_JSON);
				}
				return;
			}

			if (user.role != ROLE_OWNER){
				fromUser.writeJSON({type:"error", error:"User is not an owner."});
				return;
			}

			if (userConfig[user.ID] != null){	
				if (config.redis){
					client.hset("userRoles", user.ID, ROLE_USER);
				}
				userConfig[user.ID].role = ROLE_USER;
			}
			user.roleChange(ROLE_USER, obj.channel);
			fromUser.writeJSON({type:"info", msg:"User is no longer an owner."}, GAME_JSON);

			break;

		default:
			if (obj.toUser){
	      var user = mgserver.users[obj.toUser];
	      if (!user)
	        fromUser.writeJSON({type:"error", error:"User not found."});
	      else{
	        user.toUser(fromUser, obj, type);
	      }
	    }
	    else if (obj.toChannel){
	      var channel = mgserver.channels[obj.toChannel];
	      if (!channel)
	        fromUser.writeJSON({type:"error", error:"Channel not found."});
	      else{
	      	var muted = mutelist[fromUser.ID];
					if (muted){
						var now = Date.now();
						if (muted > now){
							fromUser.writeJSON({type:"error", error:"You have been muted.  Your mute will be lifted in " + msToStringTime(muted - now) + "."});
							return;
						}

						delete mutelist[fromUser.ID];
						delete muteinfo[fromUser.ID];
						if (config.redis){
							client.hdel("mutelist", fromUser.ID);
							client.hdel("muteinfo", fromUser.ID);
						}
					}

	        channel.toChannel(fromUser, obj, type);
	      }
		  }
	  	break;
	}
};

function checkRole(user, roleLevel){
	if (user.role < roleLevel){
		user.writeJSON({type:"error", error:"You are not authorized to perform this action."});
		return false;
	}

	return true;
}

function msToStringTime(ms){
	var unit = " seconds";
	ms /= 1000;
	if (ms > 60){
		unit = " minutes";
		ms /= 60;
		if (ms > 60){
			unit = " hours";
			ms /= 60;
			if (ms > 24){
				unit = " days";
				ms /= 24;
				if (ms > 365){
					unit = " years";
					ms /= 365;
				}
			}
		}
	}

	ms = Math.floor(ms * 100) / 100.0;
	return ms + unit;
}

module.exports = game;