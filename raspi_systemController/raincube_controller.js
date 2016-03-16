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


var request = require('request');
var GoogleSpreadsheet = require("google-spreadsheet");


var spreadsheetID = '17lSMnVHGD64vojCrmDqTtGCV4Umb_I10jkmhXt-uy64';
var spreadsheetURL = 'https://docs.google.com/forms/d/1_6dKdTor6OT_biNwnyq-i4bbwu0bjMX35EE51TMoaJc/formResponse';

var currentConfigCheckInterval = 60000; //60 seconds
var currentUploadStateInterval = 60000; //60 seconds
var configCheckIntervalObject = null;
var uploadStateIntervalObject = null;
var configCheckInProgress = false;
var uploadStateInProgress = false;

var currentRunlevel = 1;
var powerRelay1Configuration = '';
var powerRelay2Configuration = '';

var powerRelay1_value = '';
var powerRelay2_value = '';
var temperature1_value = '';
var temperature2_value = '';
var photoResistor1_value = '';
var photoResistor2_value = '';
var photoResistor3_value = '';
var photoResistor4_value = '';
var photoResistor5_value = '';
var photoResistor6_value = '';
var photoResistor7_value = '';
var photoResistor8_value = '';
var photoResistor9_value = '';
var photoResistor10_value = '';

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


function changePowerRelayValue(powerRelayID){	
	//PR0:1,PR1:1
	if(powerRelayID == 1){
		arduinoSP.write('PR0:' + powerRelay1_value + ',');
	}else if(powerRelayID == 2){
		arduinoSP.write('PR1:' + powerRelay2_value);
	}
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

		if(currentSensorName == 'LS0'){
			photoResistor1_value = currentSensorValue;
		}else if(currentSensorName == 'LS1'){
                        photoResistor2_value = currentSensorValue;
		}else if(currentSensorName == 'LS2'){
                        photoResistor3_value = currentSensorValue;
                }else if(currentSensorName == 'LS3'){
                        photoResistor4_value = currentSensorValue;
                }else if(currentSensorName == 'LS4'){
                        photoResistor5_value = currentSensorValue;
                }else if(currentSensorName == 'LS5'){
                        photoResistor6_value = currentSensorValue;
                }else if(currentSensorName == 'LS6'){
                        photoResistor7_value = currentSensorValue;
                }else if(currentSensorName == 'LS7'){
                        photoResistor8_value = currentSensorValue;
                }else if(currentSensorName == 'LS8'){
                        photoResistor9_value = currentSensorValue;
                }else if(currentSensorName == 'LS9'){
                        photoResistor10_value = currentSensorValue;
                }else if(currentSensorName == 'TS0'){
			temperature1_value = currentSensorValue;
                }else if(currentSensorName == 'TS1'){
			temperature2_value = currentSensorValue;
                }else if(currentSensorName == 'PR0'){
			powerRelay1_value = currentSensorValue;
                }else if(currentSensorName == 'PR1'){
                        powerRelay2_value = currentSensorValue;
		}
	}

	sensorData = {
		"entry.1924132895" : currentRunlevel,
		"entry.1148502686" : powerRelay1_value,
		"entry.1850644625" : powerRelay2_value,
		"entry.1826908576" : photoResistor1_value,
		"entry.565892117" : photoResistor2_value,
		"entry.1190893287" : photoResistor3_value, 
		"entry.691124397" : photoResistor4_value,
		"entry.1645202544" : photoResistor5_value,
		"entry.1894015399" : photoResistor6_value,
		"entry.32441842" : photoResistor7_value,
		"entry.1325239727" : photoResistor8_value,
		"entry.1650834472" : photoResistor9_value,
		"entry.1425764903" : photoResistor10_value,
		"entry.228287179" : temperature1_value,
		"entry.1963374879" : temperature2_value
	};

	return sensorData;
}
