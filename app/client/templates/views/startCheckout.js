Template['views_startCheckout'].helpers({
	/**
    Get the campaigns

    @method (campaigns)
    **/

	'load': function () {
		LocalStore.set('startCampaignStage', 3);
	},
	
	'receipt': function() {
		return Receipts.findOne({campaignID: 'latest'});	
	},
	
	'estimateGasCost': function() {
		var data = Receipts.findOne({campaignID: 'latest'}),
			total = 0;
		
		// if Create Controller
		if (data.createController) {
			total += 350000;
			
			// if create token
			if (data.createToken) {
				total += 150000;
			} else {// create controller with user deployed token{
				total += 180000;
			}
			
		} else {
			// create campaign with config
			total += 250000;
		}

		// if create persona
		if (data.createPersona)
			total += 90000;
		
		return total;
	},
});


Template['views_startCheckout'].events({
	/**
    Back button events

    @event (click #startBack)
    **/

	'click #startBack': function () {
		Router.go('/start/tokens');
	},
	
	/**
    Download partial receipt

    @event (click #downloadReceipt)
    **/
	
	'click #downloadReceipt': function(){
		var receipt = Receipts.findOne({campaignID: 'latest'});
		var d = new Date();
		var n = d.toISOString();
		var blob = new Blob([JSON.stringify(receipt, null, 2)], {type : 'application/json'});

		
		window.saveAs(blob, 'weifund-campaign-receipt-' + n + '.json');
	},

	/**
    Back button events

    @event (click #startBack)
    **/

	'click #createCampaign': function (event, template) {
		console.log(Receipts.findOne({campaignID: 'latest'}));
		
		if(!confirm("Are you sure you want to create this campaign (costing you approx. +/- 1 ether)?"))
			return;
		
		// get campaign local data store
		var campaignData = Receipts.findOne({campaignID: 'latest'}),
			transactionObject = {
				from: web3.eth.defaultAccount,
				gas: web3.eth.defaultGas
			},
			serviceAddedFilter = {
				_sender: web3.eth.defaultAccount,
			},
			ipfsObject = {
				campaignSchema: {
					id: 'latest',
					version: 1,
					name: campaignData.name,
					alertnateName: '',
					url: campaignData.url,
					beneficiary: campaignData.beneficiary,
					config: campaignData.config,
					fundingGoal: campaignData.fundingGoal,
					category: campaignData.category,
					owner: web3.eth.defaultAccount,
					about: campaignData.about,
					description: campaignData.description,
					address: web3.address(0),
					/*rewards: [
						{
							amountFloor: 0,
							name: '',
							description: '',
						}								
					],*/
					avatar: {
						'@type': 'ImageObject',
						'name': 'avatar',
						'contentUrl': campaignData.avatar
					},
					banner: {
						'@type': 'ImageObject',
						'name': 'banner',
						'contentUrl': campaignData.banner
					},
					mainEntityOfPage: {
						'@type': 'MediaObject',
						'name': 'mainEntity',
						'contentUrl': campaignData.mainEntityOfPage
					}
				},
			},
			personaObject = {
				'personSchema': {
					'name': campaignData.personaName,
					'image': {
						'@type': 'ImageObject',
						'name': 'avatar',
						'contentUrl': campaignData.personaImage
					}
				}
			},
			testIPFSHash = 'QmekvvCfcQg3LXXtUGeGy3kU4jGwg82txuZtVNRE8BvY9W';
		
		// Backup IPFS Data as Latest (no campaign ID yet) for emergency recovery
		IPFS_Backup.upsert({'campaignSchema.id': 'latest'}, ipfsObject);
		
		// update campaign receipt
		function updateReceipt(inputData){
			// get first key of data object, must be first before data object assignment
			var firstKey = Object.keys(inputData)[0];
			var firstData = inputData[firstKey];
			
			// Reassign object
			var data = Receipts.findOne({campaignID: 'latest'});
			delete data._id;
			
			console.log(inputData, data);
			
			// if receipt cumulative gas used not set, set default
			if(!_.has(data, 'receipts'))
				data.receipts = {};
			
			// set receipt for data object
			if(!_.has(data.receipts, firstKey))
				data.receipts[firstKey] = firstData;
			else
				data.receipts[firstKey] = Object.assign(data.receipts[firstKey], firstData);
			
			// if receipt cumulative gas used not set, set default
			if(!_.has(data, 'cumulativeGasUsed'))
				data.cumulativeGasUsed = 0;
			
			// if receipt gas used not set, set default
			if(!_.has(data, 'gasUsed'))
				data.gasUsed = 0;
			
			// if blockHashes array not set, set default
			if(!_.has(data, 'blockHashes'))
				data.blockHashes = [];
			
			// if blockNumbers array not set, set default
			if(!_.has(data, 'blockNumbers'))
				data.blockNumbers = [];
			
			// if transacitonHashes not set, set default
			if(!_.has(data, 'transactionHashes'))
				data.transactionHashes = {};
			
			// if ipfsHashes not set, set default
			if(!_.has(data, 'ipfsHashes'))
				data.ipfsHashes = {};
			
			// if errors not set, set default
			if(!_.has(data, 'errors'))
				data.errors = [];
			
			// if errors had occured
			if(_.has(data.receipts[firstKey], 'error'))
				data.errors.push(data[firstKey].error);
			
			// Complete success count
			data.successCount = 0;
			_.each(data.receipts, function(receiptItem, index){
				// if errors had occured
				if(_.has(receiptItem, 'success')) 
					data.successCount += 1;
			});
			
			// if errors had occured
			if(_.has(data.receipts[firstKey], 'ipfsHash'))
				data.ipfsHashes[firstKey] = data.receipts[firstKey].ipfsHash;
			
			// update transaciton hashes if not set
			if(_.has(data.receipts[firstKey], 'transactionHash'))
				data.transactionHashes[firstKey] = data.receipts[firstKey].transactionHash;
			
			// update transaciton hashes if not set
			if(_.has(data, 'created'))
				data.created = moment.unix();
			
			// The expected success count is equal to the number of txs produced
			data.expectedSuccessCount = Object.keys(data.transactionHashes).length + Object.keys(data.ipfsHashes).length;
			
			// Add to receipts collection
			Receipts.update({campaignID: 'latest'}, {$set: data});
			
			// get transaction receipt on success
			if(_.has(data.receipts[firstKey], 'transactionHash') && _.has(data.receipts[firstKey], 'success')) {
				// get tx receipt
				web3.eth.getTransactionReceipt(data.receipts[firstKey].transactionHash, function(err, receipt){
					if(err || !receipt || receipt == null)
						return;
			
					// update local data again, so overrights dont happen
					data = Receipts.findOne({campaignID: 'latest'});
					delete data._id;
					
					// set receipts firstKey
					if(!_.has(data.receipts, firstKey))
						data.receipts[firstKey] = {};
					
					// set receipt for data object
					data.receipts[firstKey].cumulativeGasUsed = receipt.cumulativeGasUsed.toString(10);
					data.receipts[firstKey].gasUsed = receipt.gasUsed.toString(10);
					data.receipts[firstKey].blockHash = receipt.blockHash.toString(10);
					data.receipts[firstKey].blockNumber = receipt.blockNumber.toString(10);
					
					var cumulativeGasUsedBN = new BigNumber(data.cumulativeGasUsed);
					
					var gasUsedBN = new BigNumber(data.gasUsed);
					
					// total up gas used for all tx's
					data.cumulativeGasUsed = cumulativeGasUsedBN.plus(receipt.cumulativeGasUsed).toString(10);
					
					// total up gas used for all tx's
					data.gasUsed = gasUsedBN.plus(receipt.gasUsed).toString(10);
					
					// update block hashes
					data.blockHashes.push(receipt.blockHash);
					
					// update block numbers
					data.blockNumbers.push(receipt.blockNumber);
					
					// store new receipt with updated tx receipt
					Receipts.update({campaignID: 'latest'}, {$set: data});
				});
			}
		};
		
		// create weiaccounts endpoint
		function createEndPoint(campaignID) {
			// tx override hack
			transactionObject = {
				from: web3.eth.defaultAccount,
				gas: web3.eth.defaultGas
			};
			
			console.log('EndPoint creation', campaignID, transactionObject);
			
			// register hash with campaign id
			objects.contracts.WeiAccounts.newCampaignAccount(campaignID, transactionObject, function (err, result) {
				if (err)
					return updateReceipt({
						'weiaccount': {
							error: err,
						}
					});

				// update receipt
				updateReceipt({
					'weiaccount': {
						transactionHash: result
					}
				});
			});
			
			// listen for weiaccount creation
			objects.contracts.WeiAccounts.AccountRegistered({_campaignID: campaignID}, function (err, result) {
				if (err)
					return updateReceipt({
						'weiaccount': {
							error: err,
						}
					});
				
				// get campaign account from logs
				var campaignAccount = result.args._account;

				// update receipt
				updateReceipt({
					'weiaccount': {
						success: true,
						transactionHash: result.transactionHash,
						account: campaignAccount,					
					}
				});
			});
		};

		// create campaign IPFS
		function createWeiHash(campaignID, ipfsHash) {
			// tx override hack
			transactionObject = {
				from: web3.eth.defaultAccount,
				gas: web3.eth.defaultGas
			};

			// IPFS Hash Hex
			var ipfsHashHex = '0x' + ipfs.utils.base58ToHex(ipfsHash);
			
			// register hash with campaign id
			objects.contracts.WeiHash.register(campaignID, ipfsHashHex, transactionObject, function (err, result) {
				if (err)
					return updateReceipt({
						'weihash': {
							error: err,
						}
					});

				// update receipt
				updateReceipt({
					'weihash': {
						transactionHash: result
					}
				});
			});

			// add hash registration
			objects.contracts.WeiHash.HashRegistered({
				_campaignID: campaignID
			}, function (err, result) {
				if (err)
					return updateReceipt({
						'weihash': {
							error: err,
						}
					});

				// update receipt
				updateReceipt({
					'weihash': {
						success: true,
						transactionHash: result.transactionHash
					}
				});
			});
		};

		// create campaign IPFS
		function createIPFSRepository() {

			// add campaign JSON object to IPFS
			ipfs.addJson(ipfsObject, function (err, ipfsHash) {
				if (err)
					return updateReceipt({
						'ipfs': {
							error: err,
						}
					});
				
				// update receipt
				updateReceipt({
					'ipfs': {
						success: true,
						ipfsHash: ipfsHash
					}
				});

				// Create WeiHash registration
				createWeiHash(ipfsObject.campaignSchema.id, ipfsHash);
			});
		};

		// create campaign
		function createCampaign(config) {
			// tx override hack
			transactionObject = {
				from: web3.eth.defaultAccount,
				gas: web3.eth.defaultGas
			};
			
			// start new campaign transaction
			objects.contracts.WeiFund.newCampaign(campaignData.name, campaignData.beneficiary, campaignData.fundingGoal, campaignData.expiry, config, transactionObject, function (err, result) {
				if (err)
					return updateReceipt({
						'campaign': {
							error: err,
						}
					});
				
				// update receipt
				updateReceipt({
					'campaign': {
						transactionHash: result
					}
				});
			});

			// listen for new campaign
			objects.contracts.WeiFund.CampaignCreated({
				_owner: transactionObject.from
			}, function (err, result) {
				if (err)
					return updateReceipt({
						'campaign': {
							error: err,
						}
					});

				// Campaign ID
				var campaignID = result.args._campaignID.toString(10);
				
				// update receipt
				updateReceipt({
					'campaign': {
						transactionHash: result.transactionHash,
						success: true,
						campaignID: campaignID
					}
				});
				
				// set IPFS object ID
				ipfsObject.campaignSchema.id = campaignID;
			
				// set IPFS object config address 
				ipfsObject.campaignSchema.config = config;

				// create IPFS repository
				createIPFSRepository();
				
				// create weiaccounts
				if (campaignData.createEndpoint)
					createEndPoint(campaignID);
			});
		};

		// create controller
		function createController(tokenAddress) {
			// tx override hack
			transactionObject = {
				from: web3.eth.defaultAccount,
				gas: web3.eth.defaultGas
			};
			
			// start new campaign transaction
			objects.contracts.WeiControllerFactory.newWeiController(transactionObject.from, tokenAddress, campaignData.tokenPrice, campaignData.autoDispersal, transactionObject, function (err, result) {
				if (err)
					return updateReceipt({
						'controller': {
							error: err,
						}
					});
				
				// update receipt
				updateReceipt({
					'controller': {
						transactionHash: result
					}
				});
			});

			// listen for new campaign
			objects.contracts.WeiControllerFactory.ServiceAdded(serviceAddedFilter, function (err, result) {
				if (err)
					return updateReceipt({
						'controller': {
							error: err,
						}
					});
				
				// update receipt
				updateReceipt({
					'controller': {
						success: true,
						transactionHash: result.transactionHash
					}
				});

				// WeiController address
				var controllerAddress = result.args._service;

				// create campaign
				createCampaign(controllerAddress);
			});
		};

		// cretae token
		function createToken() {
			// start new campaign transaction
			objects.contracts.WeiFund_Token_Factory.createStandardToken(transactionObject.from, campaignData.initialAmount, transactionObject, function (err, transactionHash) {
				if (err)
					return updateReceipt({
						'token': {
							error: err,
						}
					});
				
				// update receipt
				updateReceipt({
					'token': {
						success: true,
						transactionHash: transactionHash
					}
				});
			});

			// listen for new campaign
			objects.contracts.WeiFund_Token_Factory.ServiceAdded(serviceAddedFilter, function (err, result) {
				if (err)
					return updateReceipt({
						'token': {
							error: err,
						}
					});

				// token address
				var tokenAddress = result.args._service;
				
				// update receipt
				updateReceipt({
					'token': {
						success: true,
						transactionHash: result.transactionHash
					}
				});

				// create controller
				createController(tokenAddress);
			});
		};

		// create operator persona
		function createPersona() {
			// add persona object to ipfs
			ipfs.addJson(personaObject, function (err, ipfsHash) {
				if (err)
					return updateReceipt({
						'personaIPFS': {
							error: err,
						}
					});

				// build persona hash
				var ipfsHashHex = '0x' + ipfs.utils.base58ToHex(ipfsHash);
				
				// update receipt
				updateReceipt({
					'personaIPFS': {
						ipfsHash: ipfsHash,
						ipfsHashHex: ipfsHashHex,
						success: true,
					}
				});

				// update persona registration
				objects.contracts.PersonaRegistry.setPersonaAttributes(ipfsHashHex, transactionObject, function (err, result) {
					if (err)
						return updateReceipt({
							'persona': {
								error: err,
							}
						});
					
					// update receipt
					updateReceipt({
						'persona': {
							success: true,
							transactionHash: result,
						}
					});
				});
			});
		};

		// if Create Controller
		if (campaignData.createController) {
			
			// if create token
			if (campaignData.createToken) {
				createToken();
			} else {// create controller with user deployed token
				createController(campaignData.tokenAddress);
			}
			
		} else {
			// create campaign with config
			createCampaign(campaignData.config);
		}

		// if create persona
		if (campaignData.createPersona)
			createPersona();
	},
});