var usonic = require('r-pi-usonic');
var distance = 0;
usonic.init(function(error){
	if(error){
		console.log('Error = ' + error);
	}else{
		var sensor = usonic.createSensor(17, 18, 1000);
		//console.log('Sensor value = ' + sensor);
		setInterval(function(){
			distance = sensor();
			console.log('Distance ' + distance.toFixed(2) + 'cm');
		}, 60);
	}
});






var gpio = require("rpi-gpio");
var triggerPin = 11;
var echoPin = 13;

var pulseStart = null;
var pulseEnd = null;

//gpio.on('change', handlePinChange);

//gpio.setup(triggerPin, gpio.DIR_OUT);
//gpio.setup(echoPin, gpio.DIR_IN);


//gpio.setDirection(triggerPin, 'output');
//gpio.setDirection(echoPin, 'input');


var findRangeIntervalObject = null;
var findRangeInterval = 5000; //1 second

//findRangeIntervalObject = setInterval(findRange, findRangeInterval);


function reset(){
	pulseStart = null;
	pulseEnd = null;
}


function findRange(){
	reset();

	setTriggerPinState(triggerPin, 0, function(){
		setTriggerPinState(triggerPin, 1, function(){
			setTriggerPinState(triggerPin, 0, recordStart, 0);
		}, 2);
	}, 2000);
}


function setTriggerPinState(channel, state, callback, callbackDelay){
	gpio.write(channel, state, function(err){
		if(err){
			console.log(err);
			return;
		}

		if(callback){
			setTimeout(callback, callbackDelay);
		}		
	});
}


function recordStart(){
	pulseStart = new Date();
	console.log('recorded pulse start')
}

function handlePinChange(channel, value){
	console.log(channel);
	console.log(value);
	if(channel == echoPin){
		console.log('got an echo');

	}
}



