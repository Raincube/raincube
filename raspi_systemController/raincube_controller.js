
var wundernode = require("wundernode");
var weatherUnderground_apiKey = '0b59be6574b302ec';
var weatherUnderground_client = new wundernode(weatherUnderground_apiKey, false,  10, 'minute');

var modedevice = require('mode-device');
var raspberryPi_deviceID = 661;
var modedevice_APIKey = 'v1.ZHw2NjF8MA==.1458579897.2ca32952b395548d8046fb3c82adfc7a439d3d3dfa6d89ab90ad1473';
var modedevice_client = new modedevice(raspberryPi_deviceID, modedevice_APIKey);
modedevice_client.commandCallback = function(msg, flags){ processCommand(msg, flags); }
modedevice_client.listenCommands();


//Run the main logic every minute
var currentMainFunctionInterval = 60000;  //1 minute
var mainFunctionIntervalObject = null;
var mainFunctionInProgress = false;

//Run the watering cycle (check weather, determine water need, release water) every 8 hours
var currentWateringCycleInterval = 28800000; //8 hours
var wateringCycleIntervalObject = null;
var wateringCycleInProgress = false;

//Used to measure exactly how long the water should be released for (currently 1 minute)
var waterReleaseInterval = 60000;  //1 minute
var waterReleaseIntervalObject = null;
var waterReleaseInProgress = false;

var deploymentZIPCode = '33704';
var waterValve_value = 0;
var waterLevel_value = 0;
var waterLevel_beforeWateringCycle = 0;
var waterLevel_afterLastWateringCycle = 0;
var rainfallLast24Hours = 0.00;
var rainfallNext24Hours = 0.00;
var lastWateringTime = null;
var nextWateringTime = null;

var LOW_WATER_THRESHOLD_LEVEL = 2.4;	//Warnings are sent when water levels go below 5% (2.4 inches)
var WATER_LEAKAGE_THRESHOLD = 0.50;	//Warnings are sent when water levels drop more than 0.5 inches between water cycles
var DAILY_WATER_THRESHOLD = 0.50;	//Inches of water the garden needs everyday
var WATER_RELEASED_PER_CYCLE = 0.16;	//Inches of water released per watering cycle





initialize();




//Setup initial state and start timers
function initialize(){
	mainFunctionIntervalObject = setInterval(runMainFunctions, currentMainFunctionInterval);
	wateringCycleIntervalObject = setInterval(conductWateringCycle, currentWateringCycleInterval);
}

//Stop timers
function shutdown(){
	if(mainFunctionIntervalObject != null){clearInterval(mainFunctionIntervalObject);}
	if(wateringCycleIntervalObject != null){clearInterval(wateringCycleIntervalObject);}
}





function runMainFunctions(){
	if(mainFunctionInProgress){return;}
	mainFunctionInProgress = true;
  
	waterLevel_value = getWaterLevel();
	if(waterLevel_value <= LOW_WATER_THRESHOLD_LEVEL){
		modedevice_client.triggerEvent('LOW_WATER_WARNING', {'water_level': waterLevel_value});
	}
	
	if(waterLevel_value <= (waterLevel_afterLastWateringCycle - WATER_LEAKAGE_THRESHOLD)){
		modedevice_client.triggerEvent('WATER_LEAK_WARNING', {'waterLevel_current': waterLevel_value, 'waterLevel_afterLastWaterigCycle': waterLevel_afterLastWateringCycle});
	}
  
	mainFunctionInProgress = false;
}





function conductWateringCycle(){
	if(wateringCycleInProgress){return;}
	wateringCycleInProgress = true;
  
	//Fail immediately if the Raincube is empty
	waterLevel_value = getWaterLevel();
	if(waterLevel_value < WATER_RELEASED_PER_CYCLE){
		sendEvent('RAINCUBE_IS_EMPTY', {'waterLevel_value' : waterLevel_value, 'WATER_RELEASED_PER_CYCLE': WATER_RELEASED_PER_CYCLE}); 
		wateringCycleInProgress = false;
		return;
	}
	
	//Retrieve the current weather conditions from Weather Underground
	weatherUnderground_client.conditions(deploymentZIPCode, function(conditions_err, conditions_data) {
		if (conditions_err){
			console.log('errors: ' + conditions_err);
			sendEvent('ERROR_RETRIEVING_WU_DATA', {'errors' : conditions_err});
			wateringCycleInProgress = false; 
			return;
		}
		
		var conditions_json = JSON.parse(conditions_data);
		
		//Determine if we have received rainfall today
		rainfallLast24Hours = parseFloat(conditions_json['current_observation']['precip_today_in']);
		
		//Retrieve the weather forecast from Weather Underground 
		weatherUnderground_client.forecast(deploymentZIPCode, function(forecast_err, forecast_data){
			if (conditions_err){
				console.log('errors: ' + conditions_err);
				sendEvent('ERROR_RETRIEVING_WU_DATA', {'errors' : conditions_err});
				wateringCycleInProgress = false; 
				return;
			}	
		
			var forecast_json = JSON.parse(forecast_data);
			
			//Determine if it will rain later today
			rainfallNext24Hours = parseFloat(forecast_json['forecast']['simpleforecast']['forecastday'][0]['qpf_allday']['in']);
						
			//Determine if we should release water
			if(rainfallLast24Hours + WATER_RELEASED_PER_CYCLE < DAILY_WATER_THRESHOLD){
				if(rainfallNext24Hours + WATER_RELEASED_PER_CYCLE < DAILY_WATER_THRESHOLD){
					releaseWater();
				}
			}			  
		});		
	});  
}



function releaseWater(){
	if(waterReleaseInProgress){return;}
	waterReleaseInProgress = true;
  
	//Record the water level now, as a before release level
	waterLevel_beforeWateringCycle = getWaterLevel();
	sendEvent('WaterReleaseBeginning', {'waterLevel_beforeWateringCycle' : waterLevel_beforeWateringCycle});
		
	//Set a timer to close the water valve
	waterReleaseIntervalObject = setInterval(stopReleasingWater, waterReleaseInterval);  
	
	//Open the water valve
	setWaterValve(1);
	
	//Set next and last watering times
	nextWateringTime = (new Date(Date.now() + currentWateringCycleInterval)).toString();
	lastWateringTime = (new Date()).toString();
}

function stopReleasingWater(){
	//Close the water valve
	setWaterValve(0);
	
	//Make sure the water valve is closed
	var waterValve_valueCheck = getWaterValve();
	if(waterValve_valueCheck != 0){
		//Alert everyone that the water valve is stuck open
		sendEvent('WATER_VALVE_STUCK_OPEN', {'waterValve_valueCheck': waterValve_valueCheck});
		return;
	}else{
		//Turn off the timer that stops the watering cylce
		if(waterReleaseIntervalObject != null){clearInterval(waterReleaseIntervalObject);}
	}
	
	//Record the water level now, as an after release level
	waterLevel_afterLastWateringCycle = getWaterLevel();
	sendEvent('WaterReleaseEnded', {'waterLevel_afterLastWateringCycle' : waterLevel_afterLastWateringCycle});
	
	//Check if we are releasing too much water
	if((waterLevel_beforeWateringCycle - waterLevel_afterLastWateringCycle) > WATER_RELEASED_PER_CYCLE){
		//Alert everyone that we are releasing too much water
		sendEvent('RELEASING_TOO_MUCH_WATER', {'waterLevel_beforeWateringCycle':waterLevel_beforeWateringCycle, 'waterLevel_afterLastWateringCycle':waterLevel_afterLastWateringCycle, 'WATER_RELEASED_PER_CYCLE': WATER_RELEASED_PER_CYCLE, 'waterReleaseInterval':waterReleaseInterval});
	}
	
	//Watering cycle is complete
	waterReleaseInProgress = false;
	wateringCycleInProgress = false;
}


function setZIPCode(newDeploymentZIPCode){
	deploymentZIPCode = newDeploymentZIPCode;
}

function getWaterValve(){
	return 0;
}

function setWaterValve(newWaterValve_value){	
	if(newWaterValve_value == 1){
		sendEvent('WaterValveOpened', {'time': (new Date()).toString()});
	  
	}else{
		sendEvent('WaterValveClosed', {'time': (new Date()).toString()});	  
	}  
}

function getWaterLevel(){
	return 0;
}





function processCommand(msg, flags){
	var currentCommand = msg['action'];
  
	if (currentCommand == 'setZIPCode') {
		var newDeploymentZIPCode = msg['parameters']['deploymentZIPCode'];
		setZIPCode(newDeploymentZIPCode);
		sendEvent('ZIPCodeChanged', {'newDeploymentZIPCode': newDeploymentZIPCode});
	}else if(currentCommand == 'setWaterValve'){
	  
	}else if(currentCommand == 'getWaterValve'){
		waterValve_value = getWaterValve();
		sendEvent('WaterValveChecked', {'currentValue': waterValve_value});
	}else if(currentCommand == 'getWaterLevel'){
		waterLevel_value = getWaterLevel();
		sendEvent('WaterLevelChecked', {'currentValue': waterLevel_value});
	}else if(currentCommand == 'getSystemStatus'){
	
	}else if(currentCommand == 'getLastWateringTime'){
		sendEvent('LastWateringTimeRetrieved', {'lastWateringTime': lastWateringTime});
	}else if(currentCommand == 'getNextWateringTime'){
		sendEvent('NextWateringTimeRetrieved', {'nextWateringTime': nextWateringTime});
	}else if(currentCommand == 'overrideWateringCycleLock'){	
		wateringCycleInProgress = false;
		sendEvent('WateringCycleLockManuallyDisabled', {'wateringCycleInProgress': wateringCycleInProgress});
	}else if(currentCommand == 'overrideWaterReleaseLock'){	
		waterReleaseInProgress = false;
		sendEvent('WaterReleaseLockManuallyDisabled', {'waterReleaseInProgress': waterReleaseInProgress});
	}
	console.log(msg);
}



function sendEvent(eventName, eventProperties){
	modedevice_client.triggerEvent(eventName, eventProperties); 
}
