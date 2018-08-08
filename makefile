eb_deploy.zip:
	zip -r $@ build public truffle.js webpack.production.config.js logs config common server package.json .npmrc .ebextensions

clean:
	rm eb_deploy.zip
