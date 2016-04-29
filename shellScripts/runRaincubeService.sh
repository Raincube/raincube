#!/bin/sh
#
# Note runlevel 2345, 5 is the Start order and 4 is the Stop order
#
# chkconfig: 2345 5 4
# description: Raincube Controller Service
#
# Below is the source function library, leave it be
. /lib/lsb/init-functions

# result of whereis forever or whereis node
export PATH=$PATH:/usr/bin  
# result of whereis node_modules
export NODE_PATH=$NODE_PATH:/usr/lib/node_modules:/usr/local/lib/node_modules


start(){  
        forever start /home/pi/dev/raincube/raspi_systemController/raincube_controller.js
}

stop(){  
        forever stop /home/pi/dev/raincube/raspi_systemController/raincube_controller.js
}

restart(){  
        forever restart /home/pi/dev/raincube/raspi_systemController/raincube_controller.js
}

case "$1" in  
        start)
                echo "Start service - Raincube Controller Service"
                start
                ;;
        stop)
                echo "Stop service - Raincube Controller Service"
                stop
                ;;
        restart)
                echo "Restart service - Raincube Controller Service"
                restart
                ;;
        *)
                echo "Usage: $0 {start|stop|restart}"
                exit 1
                ;;
esac
