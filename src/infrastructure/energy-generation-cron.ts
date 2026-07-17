import cron from 'node-cron';
import { EnergyGenerationRecord } from './entities/EnergyGenerationRecord';

// Rated capacity of the simulated solar unit, in Watts. Should match the
// `capacity` field of the corresponding SolarUnit in the back-end so that
// capacity-factor calculations come out realistic. Configurable via env so
// this stays in sync without editing code.
const CAPACITY_WATTS = process.env.CAPACITY_WATTS
  ? parseFloat(process.env.CAPACITY_WATTS)
  : 5000;

/**
 * Calculate realistic energy generation (Wh) for a 2-hour interval, based on
 * timestamp and the unit's rated capacity.
 *
 * Generation is expressed as a fraction of rated capacity ("seasonal
 * capacity factor") achieved during a baseline daylight interval, then
 * scaled by time-of-day and random variation. This keeps output physically
 * proportional to capacity instead of a fixed magnitude, so a bigger/smaller
 * system produces bigger/smaller (and more believable) numbers.
 */
function calculateEnergyGeneration(timestamp: Date): number {
  const hour = timestamp.getUTCHours();
  const month = timestamp.getUTCMonth(); // 0-11
  const intervalHours = 2;

  let seasonalCapacityFactor = 0.22; // fall baseline
  if (month >= 5 && month <= 7) {
    seasonalCapacityFactor = 0.3; // June-August (summer)
  } else if (month >= 2 && month <= 4) {
    seasonalCapacityFactor = 0.25; // March-May (spring)
  } else if (month >= 11 || month <= 1) {
    seasonalCapacityFactor = 0.15; // December-February (winter)
  }

  const baselineIntervalWh = CAPACITY_WATTS * intervalHours * seasonalCapacityFactor;

  let timeMultiplier = 1;
  if (hour >= 6 && hour <= 18) {
    timeMultiplier = 1.2;
    if (hour >= 10 && hour <= 14) {
      timeMultiplier = 1.5;
    }
  } else {
    timeMultiplier = 0;
  }

  const variation = 0.8 + Math.random() * 0.4;
  const energyGenerated = Math.round(baselineIntervalWh * timeMultiplier * variation);

  return energyGenerated;
}

async function generateNewRecord() {
  try {
    const timestamp = new Date();
    const serialNumber = process.env.SOLAR_UNIT_SERIAL || 'SU-0001';

    const energyGenerated = calculateEnergyGeneration(timestamp);

    const record = {
      serialNumber,
      timestamp,
      energyGenerated,
      intervalHours: 2,
    };

    await EnergyGenerationRecord.create(record);
    console.log(
      `[${timestamp.toISOString()}] Generated energy record: ${energyGenerated}Wh for ${serialNumber}`
    );
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Failed to generate energy record:`,
      error
    );
  }
}

export const initializeEnergyCron = () => {
  const schedule = process.env.ENERGY_CRON_SCHEDULE || '0 */2 * * *';

  cron.schedule(schedule, async () => {
    await generateNewRecord();
  });

  console.log(
    `[Energy Cron] Scheduler initialized - Energy generation records will be created at: ${schedule}`
  );
};