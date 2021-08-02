const fs = require('fs')

newPerm = JSON.parse(fs.readFileSync('../sqlsqljson.json'))

newPerm = newPerm.map(perm => ({
	"TYPE": perm.type,
	"NAME": perm.name,
	"STATE": perm.state,
	"LDAP": perm.ldap || '',
	"INFO": perm.info || '',
	"LAST_MODIFIED": perm.last_modified || '',
	"REASONS": perm.reason || '',
	"VERSION": parseInt(perm.version) || ''
}))

fs.writeFileSync('./2_restriction.json', JSON.stringify(newPerm))