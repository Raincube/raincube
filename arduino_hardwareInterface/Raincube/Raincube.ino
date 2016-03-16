
int waterlevelSensorPin = 7;

int waterValvePowerRelayPin = 5;
boolean waterValveOpen = false;

float currentWaterLevelReading = 0.0;


void setup(){  
  Serial.begin(9600);   
  
  pinMode(waterlevelSensorPin, INPUT);
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





