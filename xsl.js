const fs = require('fs')

const OWF_DIR = './xsl_owf'

const owfMapping = JSON.parse(fs.readFileSync('owf-mapping.json'))
try {
	fs.mkdirSync(OWF_DIR)
} catch (e) { }


fs.readdirSync('./xsl').forEach(file => {
	fs.readFile(`./xsl/${file}`, 'utf-8', (err, data) => {
		Object.entries(owfMapping).forEach(e => { data = data.replace(e[0], e[1].form) })
		fs.writeFileSync(`${OWF_DIR}/${file}`, data)
	})

})