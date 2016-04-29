var config = require('./config.json');

var usonic = require('r-pi-usonic');
var ultraSonicSensor = null;

var gpio = require('rpi-gpio');
var waterValveIsClosed = true;

var wundernode = require("wundernode");
var weatherUnderground_client = new wundernode(config.weatherUnderground_APIKey, true,  10, 'minute');
var modedevice = require('mode-device');
var modedevice_client = new modedevice(config.modedevice_deviceID, config.modedevice_APIKey);
modedevice_client.commandCallback = function(msg, flags){ processCommand(msg, flags); }
modedevice_client.listenCommands();


//Run the main logic every minute
var mainFunctionIntervalObject = null;
var mainFunctionInProgress = false;

//Run the watering cycle (check weather, determine water need, release water) every 8 hours
var wateringCycleIntervalObject = null;
var wateringCycleInProgress = false;

//Used to measure exactly how long the water should be released for (currently 1 minute)
var waterReleaseIntervalObject = null;
var waterReleaseInProgress = false;

var deploymentZIPCode = config.defaultDeploymentZIPCode;
var waterValve_value = 0;
var waterLevel_value = 0;
var waterLevel_beforeWateringCycle = 0;
var waterLevel_afterLastWateringCycle = 0;
var rainfallLast24Hours = 0.00;
var rainfallNext24Hours = 0.00;
var lastWateringTime = null;
var nextWateringTime = null;

var WATER_LEVEL_SENSOR_DISTANCE_FROM_BOTTOM_OF_CONTAINER = 57.0;	//Water level sensor distance from the bottom of the raincube in inches
var WATER_LEVEL_SENSOR_ERROR_CORRECTION = 16.0;  			//Water level sensor error correction in inches
var LOW_WATER_THRESHOLD_LEVEL = 2.4;	//Warnings are sent when water levels go below 5% (2.4 inches)
var WATER_LEAKAGE_THRESHOLD = 0.50;	//Warnings are sent when water levels drop more than 0.5 inches between water cycles
var DAILY_WATER_THRESHOLD = 0.50;	//Inches of water the garden needs everyday
var WATER_RELEASED_PER_CYCLE = 0.16;	//Inches of water released per watering cycle





initialize();




//Setup initial state and start timers
function initialize(){
	mainFunctionIntervalObject = setInterval(runMainFunctions, config.mainFunctionInterval);
	wateringCycleIntervalObject = setInterval(conductWateringCycle, config.wateringCycleInterval);

	usonic.init(function(error){
		if(error){
			console.log('Error loading the water level sensor. Details: ' + error);
		}else{
			ultraSonicSensor = usonic.createSensor(config.ultraSonicSensor_echoGPIO, config.ultraSonicSensor_triggerGPIO, 1000);
		}
	});

	gpio.setup(config.waterValve_controlPin, gpio.DIR_OUT);
}
//Stop timers
function restartTimers(){
	if(mainFunctionIntervalObject != null){clearInterval(mainFunctionIntervalObject);}
	if(wateringCycleIntervalObject != null){clearInterval(wateringCycleIntervalObject);}

        mainFunctionIntervalObject = setInterval(runMainFunctions, config.mainFunctionInterval);
        wateringCycleIntervalObject = setInterval(conductWateringCycle, config.wateringCycleInterval);
}




function runMainFunctions(){
	if(mainFunctionInProgress){return;}
	mainFunctionInProgress = true;
  
	waterLevel_value = getWaterLevel();
	if(waterLevel_value <= LOW_WATER_THRESHOLD_LEVEL){
		sendEvent('LOW_WATER_WARNING', {'water_level': waterLevel_value});
	}
	
	if(waterLevel_value <= (waterLevel_afterLastWateringCycle - WATER_LEAKAGE_THRESHOLD)){
		sendEvent('WATER_LEAK_WARNING', {'waterLevel_current': waterLevel_value, 'waterLevel_afterLastWaterigCycle': waterLevel_afterLastWateringCycle});
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
			
			console.log(rainfallLast24Hours);
			console.log(rainfallNext24Hours);			
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
	waterReleaseIntervalObject = setInterval(stopReleasingWater, config.waterReleaseInterval);  
	
	//Open the water valve
	setWaterValve(1);
	
	//Set next and last watering times
	nextWateringTime = (new Date(Date.now() + config.wateringCycleInterval)).toString();
	lastWateringTime = (new Date()).toString();
}

function stopReleasingWater(){
	//Close the water valve
	setWaterValve(0);
	
	//Make sure the water valve is closed
	if(!waterValveIsClosed){
		//Alert everyone that the water valve is stuck open
		sendEvent('WATER_VALVE_STUCK_OPEN', {'waterValveIsClosed': waterValveIsClosed});
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

function setWaterValve(newWaterValve_value){	
	gpio.write(config.waterValve_controlPin, newWaterValve_value, function(error){
		if(error){
			console.log('Failed to change the water valve state. Details: ' + error);
			return;
		}

		waterValveIsClosed = (newWaterValve_value == 0);
		waterValve_value = newWaterValve_value;
		if(newWaterValve_value == 1){
			sendEvent('WaterValveOpened', {'time': (new Date()).toString()});	  
		}else{
			sendEvent('WaterValveClosed', {'time': (new Date()).toString()});	  
		}  
	});
}

function getWaterLevel(){
	var tempWaterLevelReadingInCentimeters = (ultraSonicSensor()).toFixed(2);
	var tempWaterLevelReadingInInches = tempWaterLevelReadingInCentimeters / 2.5;

	var actualWaterLevelReadingInInches = (WATER_LEVEL_SENSOR_DISTANCE_FROM_BOTTOM_OF_CONTAINER - (tempWaterLevelReadingInInches + WATER_LEVEL_SENSOR_ERROR_CORRECTION)).toFixed(2);

	sendEvent('WaterLevelChecked', {'currentValue': actualWaterLevelReadingInInches});

	return actualWaterLevelReadingInInches;
}





function processCommand(msg, flags){
	var currentCommand = msg['action'];
  
	if (currentCommand == 'setZIPCode') {
		var newDeploymentZIPCode = msg['parameters']['deploymentZIPCode'];
		setZIPCode(newDeploymentZIPCode);
		sendEvent('ZIPCodeChanged', {'newDeploymentZIPCode': newDeploymentZIPCode});
	}else if(currentCommand == 'setWaterValve'){
		var newWaterValve_value = msg['parameters']['waterValve_value'];
		setWaterValve(newWaterValve_value);	
	}else if(currentCommand == 'getWaterValve'){
		sendEvent('WaterValveChecked', {'isClosed': waterValveIsClosed});
	}else if(currentCommand == 'getWaterLevel'){
		waterLevel_value = getWaterLevel();
		sendEvent('WaterLevelChecked', {'currentValue': waterLevel_value});
	}else if(currentCommand == 'getSystemStatus'){

	}else if(currentCommand == 'changeWateringCycleInterval'){
		var newWateringCycleInterval = msg['parameters']['wateringCycleInterval'];
		config.wateringCycleInterval = newWateringCycleInterval;
		restartTimers();	
		sendEvent('WateringCycleIntervalChanged',{'wateringCycleInterval':config.wateringCycleInterval});
	}else if(currentCommand == 'changeWaterReleaseInterval'){
		var newWaterReleaseInterval = msg['parameters']['waterReleaseInterval'];
		config.waterReleaseInterval = newWaterReleaseInterval;
		sendEvent('WaterReleaseIntervalChanged', {'waterReleaseInterval':config.waterReleaseInterval});
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
	console.log(eventName); 
}
