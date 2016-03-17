
#define triggerPin 13
#define echoPin 12
#define waterValvePowerRelayPin = 5;

boolean waterValveOpen = false;
long currentWaterLevelReading = 0;


//VCC=Blue
//Trig=Orange
//Echo=Green
//Ground=Brown











void setup(){  
  Serial.begin(9600);   
  
  pinMode(triggerPin, OUTPUT);
  pinMode(echoPin, INPUT);  
  pinMode(waterValvePowerRelayPin, OUTPUT);
  
  digitalWrite(waterValvePowerRelayPin, LOW);
}





void loop(){
  
  updateWaterLevelReading();

  respondToCommandsFromSerialInput();
  
  writeAllReadingsToSerialOutput();
           
  delay(1000);    
}











void updateWaterLevelReading(){  
  long duration, distance;
  
  digitalWrite(triggerPin, LOW);
  delayMicroseconds(2); 
  digitalWrite(triggerPin, HIGH);
  delayMicroseconds(10); 
  digitalWrite(triggerPin, LOW);
  
  duration = pulseIn(echoPin, HIGH);
  distance = (duration/2) / 29.1;
  
  if (distance >= 500 || distance <= 0){
    currentWaterLevelReading = 0;
  } else {
    currentWaterLevelReading = distance;
  }
  
}



void respondToCommandsFromSerialInput(){  
  if(Serial.available() > 0){
    String currentCommand = Serial.readString();
    
    Serial.print("Received command from Raspi =");
    Serial.println(currentCommand);
    
    if(currentCommand.indexOf("WV:") > -1){
      int waterValveCommandIndex = currentCommand.indexOf("WV:");
      waterValveOpen = (currentCommand.charAt(waterValveCommandIndex+3) == '1');
      digitalWrite(waterValvePowerRelayPin, ((waterValveOpen) ? HIGH : LOW));
    }
  }  
}



void writeAllReadingsToSerialOutput(){
  Serial.print("WL:");
  Serial.print(currentWaterLevelReading);
  Serial.print(",WV:");
  Serial.println(waterValveOpen);
}





