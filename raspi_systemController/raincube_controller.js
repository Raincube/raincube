var request = require('request');

var serialport = require('serialport');
var SerialPort = serialport.SerialPort;
var arduinoSP = new SerialPort('/dev/ttyACM0', { baudrate: 9600, parser: serialport.parsers.readline('\n') });
arduinoSP.on('open', function(){
	console.log('USB Serial connection opened with Arduino...');
	arduinoSP.on('data', function(data){
		console.log(' - message from Arduino = ' + data);
		parseSensorData(data);
	});
});



var currentConfigCheckInterval = 60000; //60 seconds
var currentUploadStateInterval = 60000; //60 seconds
var configCheckIntervalObject = null;
var uploadStateIntervalObject = null;
var configCheckInProgress = false;
var uploadStateInProgress = false;

var currentRunlevel = 1;
var waterValveConfiguration = '';

var waterValve_value = '';
var waterLevel_value = '';

var sensorData = {};




initialize();







//Setup initial state and start timers
function initialize(){
	configCheckIntervalObject = setInterval(loadCurrentConfiguration, currentConfigCheckInterval);
	
	if(currentRunlevel == 3){
		uploadStateIntervalObject = setInterval(uploadCurrentState, currentUploadStateInterval);
	}
}

//Stop timers
function shutdown(){
	if(configCheckIntervalObject != null){clearInterval(configCheckIntervalObject);}
	if(uploadStateIntervalObject != null){clearInterval(uploadStateIntervalObject);}
}









function loadCurrentConfiguration(){
	if(configCheckInProgress){return;}
	configCheckInProgress = true;

	console.log('loading the configuration from the Google spreadsheet...');

	var algaePBR_spreadsheet = new GoogleSpreadsheet(spreadsheetID);

	//Worksheet 2 is the Control Panel
	algaePBR_spreadsheet.getRows(2, { 'start-index':2,'max-results':6 }, function(err, row_data){
		
		if(err){
			console.log('ERROR');
		}else{
			for(var i = 0; i < 5; i++){
				switch(i){
					case 0:
						if(currentRunlevel != row_data[i].value){
							console.log('changing runlevel to ' + row_data[i].value);
	
							if(currentRunlevel != 0 && row_data[i].value == 0){
								currentConfigCheckInterval = 3600000; //One hour
							}
						
							currentRunlevel = row_data[i].value;
							shutdown();
							initialize();
						}							
						break;
					case 1:
						if(currentRunlevel > 1){
							powerRelay1Configuration = row_data[i].value;

							if(powerRelay1Configuration == 'AUTO'){
                                                        }else{ 
                                                                if(powerRelay1Configuration == 'ON'){
                                                                        powerRelay1_value = 1;
                                                                }else{
                                                                        powerRelay1_value = 0;
                                                                }
                                                                changePowerRelayValue(1);
                                                        }
						}else if(currentRunlevel <= 1){
                                                        powerRelay1Configuration = 'OFF';
                                                        powerRelay1_value = 0;
                                                }
						break;
					case 2:
						if(currentRunlevel > 1){
                                                        powerRelay2Configuration = row_data[i].value;

                                                        if(powerRelay2Configuration == 'AUTO'){
							}else{
								if(powerRelay2Configuration == 'ON'){
                                                                	powerRelay2_value = 1;
                                                        	}else{
                                                                	powerRelay2_value = 0;
                                                        	}
                                                        	changePowerRelayValue(2);
							}
                                                }else if(currentRunlevel <= 1){
							powerRelay2Configuration = 'OFF';
							powerRelay2_value = 0;
						}
						break;
					case 3:
						if(currentConfigCheckInterval != row_data[i].value && currentRunlevel != 0){
							currentConfigCheckInterval = row_data[i].value;
							shutdown();
							initialize();
						}
						break;
					case 4:
						if(currentUploadStateInterval != row_data[i].value && currentRunlevel == 3){
                                                        currentUploadStateInterval = row_data[i].value;
                                                        shutdown();
                                                        initialize();
                                                }
						break;
					default:
						break;

				}
			}		
		}
		
		configCheckInProgress = false;
	});

}


function sendWaterValveCommand(){
	arduinoSP.write('WV:' + waterValve_value);
}


function uploadCurrentState(){
	console.log('posting data to google....');
	request.post(
		spreadsheetURL,
		{ form: sensorData },
		function(err, response, body){
			if(!err && response.statusCode == 200){
				console.log('SUCCESS');
			}else{
				console.log('ERROR');
				console.log(response);
				console.log(body);
			}
		}
	);
}


function parseSensorData(data){

	var allSensorReadings = data.split(',');
	var currentSensorName = '';
	var currentSensorValue = '';

	for(var i = 0; i < allSensorReadings.length; i++){
		currentSensorName = allSensorReadings[i].split(':')[0];
		currentSensorValue = allSensorReadings[i].split(':')[1];

		if(currentSensorName == 'WL'){
			waterLevel_value = currentSensorValue;
		}else if(currentSensorName == 'WV'){
                        waterValve_value = currentSensorValue;
		}
	}

	sensorData = {
		"entry.1924132895" : currentRunlevel,
		"entry.1148502686" : waterValve_value,
		"entry.1826908576" : waterLevel_value
	};

	return sensorData;
}
