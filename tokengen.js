var crypto = require('crypto');
var redis = require('redis');

var id = parseInt(process.argv[2]);
var role = parseInt(process.argv[3]);

if (!id || !role)
	console.log("FAIL");
else{

	var token = crypto.randomBytes(16).toString('base64').replace(/=/g,"");

	console.log("\"Options\"");
	console.log("{");
	console.log("\t\"token\"\t\t\"" + token + "\"");
	console.log("}");

	client = redis.createClient();

	client.hset("userTokens", id, token);
	client.hset("userRoles", id, role);

	client.set("reloadtokens", "yes");
}