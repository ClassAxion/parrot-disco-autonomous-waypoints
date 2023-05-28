import Telemetry from './interface/Telemetry.interface';
import { io, Socket } from 'socket.io-client';
import logger from './utils/logger';
import Algorithm from './module/Algorithm.module';
import dotenv from 'dotenv';
import { readFile } from 'fs/promises';

dotenv.config();

const target = process.env.TARGET || process.argv[2];

if (!target) process.exit(1);

let socket: Socket,
    telemetry: Telemetry = {},
    current: Telemetry = {};

interface Waypoint {
    latitude: number;
    longitude: number;
}

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
    // https://i.imgur.com/YcUGkxS.png
    // https://i.imgur.com/Ld0VSbE.png

    const waypoints: Waypoint[] = JSON.parse(await readFile('./waypoints/big.json', 'utf-8'));

    logger.info(`Connecting...`);

    socket = io(target);

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

    let selected = 1;

    const requiredDistance = 125;

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

        if (distance < requiredDistance && Date.now() - lastChange > 15 * 1000) {
            // if fulfilled, it goes to the next one

            console.log(`Waypoint ${selected + 1} reached.`);

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
