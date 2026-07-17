import mongoose from "mongoose";
import { EnergyGenerationRecord } from "./entities/EnergyGenerationRecord";
import dotenv from "dotenv";
import { connectDB } from "./db";
dotenv.config();
const CAPACITY_WATTS = process.env.CAPACITY_WATTS
  ? parseFloat(process.env.CAPACITY_WATTS)
  : 5000;

const ANOMALY_SCENARIOS = {
  outageDate: "2025-11-10",
  suddenDropDate: "2025-11-14",
  degradationStart: "2025-11-09",
  degradationEnd: "2025-11-23",
  sensorErrorTimestamp: "2025-11-05T12:00:00.000Z",
  dataGapDate: "2025-11-18",
  dataGapStartHour: 8,
  dataGapEndHour: 16,
};

function applyAnomalyScenarios(records: any[]) {
  const degradationStartMs = new Date(
    `${ANOMALY_SCENARIOS.degradationStart}T00:00:00.000Z`
  ).getTime();
  const degradationEndMs = new Date(
    `${ANOMALY_SCENARIOS.degradationEnd}T23:59:59.999Z`
  ).getTime();
  const degradationSpanMs = degradationEndMs - degradationStartMs;

  for (const record of records) {
    const ts = record.timestamp.getTime();
    const dateKey = record.timestamp.toISOString().slice(0, 10);

    if (ts >= degradationStartMs && ts <= degradationEndMs) {
      const progress = (ts - degradationStartMs) / degradationSpanMs;
      const factor = 1 - progress * 0.3;
      record.energyGenerated = Math.round(record.energyGenerated * factor);
    }

    if (dateKey === ANOMALY_SCENARIOS.suddenDropDate) {
      record.energyGenerated = Math.round(record.energyGenerated * 0.45);
    }

    if (dateKey === ANOMALY_SCENARIOS.outageDate) {
      record.energyGenerated = 0;
    }

    if (
      record.timestamp.toISOString() === ANOMALY_SCENARIOS.sensorErrorTimestamp
    ) {
      record.energyGenerated = Math.round(
        CAPACITY_WATTS * record.intervalHours * 2.5
      );
    }
  }

  return records.filter((record) => {
    const dateKey = record.timestamp.toISOString().slice(0, 10);
    if (dateKey !== ANOMALY_SCENARIOS.dataGapDate) return true;
    const hour = record.timestamp.getUTCHours();
    return (
      hour < ANOMALY_SCENARIOS.dataGapStartHour ||
      hour > ANOMALY_SCENARIOS.dataGapEndHour
    );
  });
}

async function seed() {
  const serialNumber = process.env.SOLAR_UNIT_SERIAL || "SU-0001";
  try {
    await connectDB();
    await EnergyGenerationRecord.deleteMany({});
    let records: any[] = [];
    const startDate = new Date("2025-08-01T08:00:00Z");
    const endDate = new Date("2025-11-23T08:00:00Z");
    const intervalHours = 2;
    let currentDate = new Date(startDate);
    let recordCount = 0;
    while (currentDate <= endDate) {
      const hour = currentDate.getUTCHours();
      const month = currentDate.getUTCMonth();
      let seasonalCapacityFactor = 0.22;
      if (month >= 5 && month <= 7) {
        seasonalCapacityFactor = 0.3;
      } else if (month >= 2 && month <= 4) {
        seasonalCapacityFactor = 0.25;
      } else if (month >= 11 || month <= 1) {
        seasonalCapacityFactor = 0.15;
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
      records.push({
        serialNumber: serialNumber,
        timestamp: new Date(currentDate),
        energyGenerated: energyGenerated,
        intervalHours,
      });
      currentDate = new Date(currentDate.getTime() + intervalHours * 60 * 60 * 1000);
      recordCount++;
    }
    records = applyAnomalyScenarios(records);
    await EnergyGenerationRecord.insertMany(records);
    console.log(
      `Database seeded successfully. Generated ${records.length} energy generation records (capacity: ${CAPACITY_WATTS}W) from ${startDate.toUTCString()} to ${endDate.toUTCString()}, with 5 anomaly scenarios injected in Nov 2025.`
    );
  } catch (err) {
    console.error("Seeding error:", err);
  } finally {
    await mongoose.disconnect();
  }
}
seed();
