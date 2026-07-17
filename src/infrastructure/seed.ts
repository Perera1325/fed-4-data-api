import mongoose from "mongoose";
import { EnergyGenerationRecord } from "./entities/EnergyGenerationRecord";
import dotenv from "dotenv";
import { connectDB } from "./db";

dotenv.config();

const CAPACITY_WATTS = process.env.CAPACITY_WATTS
  ? parseFloat(process.env.CAPACITY_WATTS)
  : 5000;

async function seed() {
  const serialNumber = process.env.SOLAR_UNIT_SERIAL || "SU-0001";

  try {
    await connectDB();
    await EnergyGenerationRecord.deleteMany({});

    const records = [];
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
    await EnergyGenerationRecord.insertMany(records);

    console.log(
      `Database seeded successfully. Generated ${recordCount} energy generation records (capacity: ${CAPACITY_WATTS}W) from ${startDate.toUTCString()} to ${endDate.toUTCString()}.`
    );
  } catch (err) {
    console.error("Seeding error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

seed();