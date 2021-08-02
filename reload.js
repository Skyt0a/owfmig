const axios = require('axios')
const fsLegacy = require('fs')
const fs = fsLegacy.promises

function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

fs.readdir('./XML')
	.then(async (res) => {

		for (let i = 0; i < res.length; i++) {
			let file = res[i]

			await axios.post('http://powen.cc.cec.eu.int:8082/jasspr/services/xml/v1/schemas/load', {
				debugLevel: "0",
				method: "single-file",
				mode: "owf",
				selectedFile: `/ec/prod/app/webroot/home/production/shared/OWF_GEN/${file}`
			}, {
				auth: {
					username: 'bazinje',
					password: 'Ensimag0!'
				}
			}).catch(result => {
				console.error(`Send ${file}`)
				console.error(result.response.statusText)
			})

			process.stdout.cursorTo(0);
			process.stdout.write(`${i+1} / ${res.length}`);
		}
	})