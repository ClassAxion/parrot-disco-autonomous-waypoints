import Telemetry from './interface/Telemetry.interface';
import { io, Socket } from 'socket.io-client';
import logger from './utils/logger';
import Algorithm from './module/Algorithm.module';

if (!process.argv[2]) process.exit(1);

const target = process.argv[2];

let socket: Socket, telemetry: Telemetry, current: Telemetry;

interface Waypoint {
    latitude: number;
    longitude: number;
}

let selected = 0;

const waypoints: Waypoint[] = [
    // https://i.imgur.com/YcUGkxS.png
    {
        latitude: 53.35562,
        longitude: 17.6591,
    },
    {
        latitude: 53.3619,
        longitude: 17.64755,
    },
    {
        latitude: 53.35738,
        longitude: 17.62547,
    },
    {
        latitude: 53.33989,
        longitude: 17.61825,
    },
    {
        latitude: 53.33252,
        longitude: 17.64618,
    },
    {
        latitude: 53.34049,
        longitude: 17.65853,
    },
];

function attachEvents() {
    socket.on('altitude', ({ altitude }) => {
        telemetry.altitude = {
            value: altitude,
            lastReceivedAt: Date.now(),
        };
    });

    socket.on('location', ({ latitude, longitude }) => {
        telemetry.location = {
            latitude,
            longitude,
            lastReceivedAt: Date.now(),
        };
    });

    socket.on('heading', ({ heading }) => {
        telemetry.heading = {
            value: heading,
            lastReceivedAt: Date.now(),
        };
    });

    socket.on('speed ', ({ speed }) => {
        telemetry.speed = {
            value: speed,
            lastReceivedAt: Date.now(),
        };
    });
}

(async () => {
    logger.info(`Connecting to ${target}`);

    const socket = io(target);

    await new Promise<void>((r) => socket.once('connect', () => r()));

    socket.on('disconnect', () => {
        logger.error(`Connection lost, aborting`);
        process.exit(1);
    });

    logger.info(`Disco connected`);

    attachEvents();

    logger.info(`Events attached`);

    await new Promise((r) => setTimeout(r, 15 * 1000));

    logger.info(`Starting..`);

    const algorithm = new Algorithm();

    let lastRoll: number,
        lastChange = 0;

    while (true) {
        const currentWaypoint = waypoints[selected];

        algorithm.setTelemetry('A', telemetry);
        algorithm.setTelemetry('B', {
            altitude: {
                value: 100,
                lastReceivedAt: Date.now(),
            },
            heading: {
                value: 0,
                lastReceivedAt: Date.now(),
            },
            location: {
                latitude: currentWaypoint.latitude,
                longitude: currentWaypoint.longitude,
                lastReceivedAt: Date.now(),
            },
            speed: {
                value: 0,
                lastReceivedAt: Date.now(),
            },
        });

        const roll = algorithm.getRollAxis();

        algorithm.getThrottle();

        const distance = algorithm.getDistance();

        // console.log(`Roll: ${roll}, Last distance ${distance}m`);

        if (distance < 50 && Date.now() - lastChange > 15 * 1000) {
            // if fulfilled, it goes to the next one

            console.log(`Waypoint reached.`);

            if (++selected === waypoints.length) {
                selected = 0;

                console.log(`That was last waypoint, starting from first waypoint`);
            }

            lastChange = Date.now();
        }

        if (!lastRoll || lastRoll !== roll || roll === 50 || roll === -50) {
            socket.emit('move', { roll });
        }

        lastRoll = roll;

        await new Promise<void>((r) => setTimeout(r, 100));
    }
})();
