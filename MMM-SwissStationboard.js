/* global Module */

/* Magic Mirror
 * Module: MMM-SwissStationboard
 *
 * By vanhoekd
 * based on MMM-SwissCommute  by nixnuex
 *
 * MIT Licensed.
 */

Module.register("MMM-SwissStationboard",{
	// Define module defaults
	defaults: {
		updateInterval: 2 * 60 * 1000, // Update every 2 minutes. Note: search.ch API limit is 1000 requests per day
		animationSpeed: 2000,
		fade: true,
		fadePoint: 0.25, // Start on 1/4th of the list.
        initialLoadDelay: 0, // start delay seconds.

        domRefresh: 1000 * 30, // Refresh Dom each 30 s
		
        apiBase: 'https://fahrplan.search.ch/api/stationboard.json',
        stop: '',
		maximumEntries: 5, // Total Maximum Entries
        minWalkingTime: -1,
        hideTrackInfo: 0,
	hideNotReachable: 0,
                
//		titleReplace: {
//			"Zeittabelle ": ""
//		}
	},
	
	requiresVersion: "2.1.0", // Required version of MagicMirror

	// Define start sequence.
	start: function() {
		Log.info("Starting module: " + this.name);

		// Set locale.
		moment.locale(config.language);

        this.trains = [];
		this.loaded = false;
		this.scheduleUpdate(this.config.initialLoadDelay);

		// Update DOM seperatly and not only on schedule Update
		var self = this;
		setInterval(function() {
			self.updateDom(this.config.animationSpeed);
		}, this.config.domRefresh);

		this.updateTimer = null;

	},   
	
	// Define required scripts.
	getStyles: function() {
		return ["MMM-SwissStationboard.css", "font-awesome.css"];
	},

	// Define required scripts.
	getScripts: function() {
		return ["moment.js"];
	}, 
    
	// Override dom generator.
	getDom: function() {
		var wrapper = document.createElement("div");

		var currentTime = moment();
		
		if (!this.config.stop) {
			wrapper.innerHTML = "Invalid starting point";
			wrapper.className = "dimmed light small";
			return wrapper;
		}
		
		
		
		if (!this.loaded) {
			wrapper.innerHTML = "Loading trains ...";
			wrapper.className = "dimmed light small";
			return wrapper;
		}

		if (this.message) {
			wrapper.innerHTML = this.message;
			wrapper.className = "dimmed light small";
			return wrapper;
		}
		
		var table = document.createElement("table");
		table.className = "small";
		var displayedConnections = 0;

		var non_reachable = 0;

		for (var t in this.trains) {
			var trains = this.trains[t];

			var dTime = moment(trains.departureTimestampRaw);
			var diff = dTime.diff(currentTime, 'minutes');
			if(this.config.hideNotReachable){
				if(trains.delay > 0){
					if (diff + trains.delay < this.config.minWalkingTime ){
					continue;
					}
				} else if (diff < this.config.minWalkingTime ){
					continue;
				}
			}
			
			displayedConnections++;
			if (displayedConnections > this.config.maximumEntries){
				break;
			}
			var row = document.createElement("tr");
			table.appendChild(row);
			
			// Time
			var depCell = document.createElement("td");
			depCell.className = "align-left departuretime";
			depCell.innerHTML = trains.departureTimestamp;

            if(trains.delay > 0){
				if (diff + trains.delay < this.config.minWalkingTime ){
					non_reachable++;  // Count number of non-reachable connections to start fading only reachable ones
    				row.className = "darkgrey";
				}
			} else if (diff < this.config.minWalkingTime ){
				non_reachable++;  // Count number of non-reachable connections to start fading only reachable ones
				row.className = "darkgrey";
			}
			row.appendChild(depCell);

			// Delay
            var delayCell = document.createElement("td");
            if(trains.delay > 0) {
                delayCell.className = "delay red";
                delayCell.innerHTML = "+" + trains.delay + " min";
            } else {
                delayCell.className = "black";
                delayCell.innerHTML = "+0 min"; //trains.delay;
            }
            row.appendChild(delayCell);
			
			// Number
			var trainNumberCell = document.createElement("td");
			if (trains.type.localeCompare("bus")==0 || trains.type.localeCompare("post")==0){
				trainNumberCell.innerHTML = "<i class=\"fa fa-bus\"></i> " + trains.number;
			} else if(trains.type.localeCompare("tram")==0){
				trainNumberCell.innerHTML = "<i class=\"fa fa-subway\"></i> " + trains.number;
			}else if(trains.type.localeCompare("strain")==0 || trains.type.localeCompare("express_train")==0 || trains.type.localeCompare("train")==0){
				trainNumberCell.innerHTML = "<i class=\"fa fa-train\"></i> " + trains.number;
			}else{
				trainNumberCell.innerHTML = "" + trains.number;
			}
			trainNumberCell.className = "align-left";
			row.appendChild(trainNumberCell);
			
			// Track
            if (!this.config.hideTrackInfo) {
	            var trackCell = document.createElement("td");
    	        trackCell.innerHTML = trains.track;
				trackCell.className = "align-right";
        	    if(trains.trackChange) trackCell.className = "align-right track red";
            	row.appendChild(trackCell);
            }

			// Direction
			var trainToCell = document.createElement("td");
			trainToCell.innerHTML = trains.to;
			trainToCell.className = "align-right trainto";
			row.appendChild(trainToCell);

			
            
            

			if (this.config.fade) {
				var steps = this.trains.length - non_reachable;
				if (t >= non_reachable) {
					var currentStep = t - non_reachable;
					row.style.opacity = 1 - (1 / steps * currentStep);
				}
			}
		}

		return table;
	},

	/* getData(compliments)
	 * Calls processData on succesfull response.
	 */
	getData: function() {
		var url = this.config.apiBase + this.getParams();
		var self = this;
		var retry = true;
		

		var trainRequest = new XMLHttpRequest();
		trainRequest.open("GET", url, true);
		trainRequest.onreadystatechange = function() {
			if (this.readyState === 4) {
				if (this.status === 200) {
					self.processData(JSON.parse(this.response));
				} else if (this.status === 401) {
					self.config.station = "";
					self.updateDom(self.config.animationSpeed);

					Log.error(self.name + ": Incorrect waht so ever...");
					retry = false;
				} else {
					Log.error(self.name + ": Could not load trains.");
				}

				if (retry) {
					self.scheduleUpdate((self.loaded) ? -1 : self.config.retryDelay);
				}
			}
		};
		trainRequest.send();
	},

	/* getParams(compliments)
	 * Generates an url with api parameters based on the config.
	 *
	 * return String - URL params.
	 */
	getParams: function() {
		var params = "?show_delays=1&show_trackchanges=1&show_tracks=1&";
        params += "stop=" + this.config.stop;
		if(this.config.hideNotReachable){
			params += "&limit=" + (this.config.maximumEntries + 50*this.config.minWalkingTime);
                } else{
			params += "&limit=" + this.config.maximumEntries;
		}
		return params;
	},

	/* processData(data)
	 * Uses the received data to set the various values.
	 *
	 *
	 */
	processData: function(data) {
		this.trains = [];
		this.message = "";
		
		if ('connections' in data) {
			for (var i = 0, count = data.connections.length; i < count; i++) {
				var trains = data.connections[i];

				if("time" in trains && "terminal" in trains) {
					
					var conn = {
						departureTimestampRaw: trains.time,
						departureTimestamp: moment(trains.time).format("HH:mm"),
						delay: parseInt(trains.dep_delay),
						to: trains.terminal.name,
						number: trains.line,
						track: trains.track,
						type: trains.type
					};
					
					if (typeof conn.number == 'undefined'){
						conn.number = trains.number;
					}
					if (typeof conn.track != 'undefined') {
						conn.trackChange = conn.track.indexOf("!") > 0;
					}
					else {
						conn.track = "";
						conn.trackChange = 0;
					}
								
					this.trains.push(conn);
				}
			}
		}
		else {
			this.message = data.messages[0];
		}	

		this.loaded = true;
		this.updateDom(this.config.animationSpeed);
	},

	/* scheduleUpdate()
	 * Schedule next update.
	 *
	 * argument delay number - Milliseconds before next update. If empty, this.config.updateInterval is used.
	 */
	scheduleUpdate: function(delay) {
		var nextLoad = this.config.updateInterval;
		if (typeof delay !== "undefined" && delay >= 0) {
			nextLoad = delay;
		}

		var self = this;
		clearTimeout(this.updateTimer);
		this.updateTimer = setTimeout(function() {
			self.getData();
		}, nextLoad);
	},
});
