import type {
  Car,
  Entry,
  RefuelIntervalMetric,
  RefuelResolution,
} from "../types";
import { formatFuelVolumeUnitShortLabel } from "./formatters";
import {
  isNonNegativeNumber,
  isPositiveNumber,
  roundTo2,
  roundTo4,
} from "./numbers";

export function resolveRefuelValues(
  amountInput: number,
  priceInput: number,
  moneyInput: number,
): RefuelResolution {
  const hasAmount = isPositiveNumber(amountInput);
  const hasPrice = isPositiveNumber(priceInput);
  const hasMoney = isNonNegativeNumber(moneyInput);

  let resolvedAmount: number | null = null;
  let resolvedPrice: number | null = null;
  let resolvedMoney: number | null = null;

  if (hasAmount) {
    resolvedAmount = roundTo2(amountInput);
  } else if (hasPrice && hasMoney && moneyInput > 0) {
    resolvedAmount = roundTo2(moneyInput / priceInput);
  }

  if (hasPrice) {
    resolvedPrice = roundTo4(priceInput);
  } else if (hasAmount && hasMoney && amountInput > 0) {
    resolvedPrice = roundTo4(moneyInput / amountInput);
  }

  if (hasMoney) {
    resolvedMoney = roundTo2(moneyInput);
  } else if (hasAmount && hasPrice) {
    resolvedMoney = roundTo2(amountInput * priceInput);
  }

  return {
    providedCount: [hasAmount, hasPrice, hasMoney].filter(Boolean).length,
    amountAdded: resolvedAmount,
    pricePerUnit: resolvedPrice,
    moneyPaid: resolvedMoney,
  };
}

export function calculateTankStateAfterRefuel(
  currentTankState: number,
  amountAdded: number,
  car: Car,
) {
  if (car.fuelStateMode === "volume") {
    return roundTo2(Math.min(currentTankState + amountAdded, car.tankCapacity));
  }

  const addedPercent = (amountAdded / car.tankCapacity) * 100;
  return roundTo2(Math.min(currentTankState + addedPercent, 100));
}

export function tankStateToVolume(tankState: number, car: Car) {
  if (car.fuelStateMode === "volume") {
    return tankState;
  }

  return (tankState / 100) * car.tankCapacity;
}

export function computeRefuelMetrics(entriesDesc: Entry[], car: Car) {
  const entriesAsc = [...entriesDesc].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  const metrics: Record<string, RefuelIntervalMetric> = {};
  let previousRefuelIndex = -1;

  for (let i = 0; i < entriesAsc.length; i++) {
    const entry = entriesAsc[i];

    if (entry.type !== "refuel") continue;

    if (previousRefuelIndex === -1) {
      previousRefuelIndex = i;
      continue;
    }

    const previousRefuel = entriesAsc[previousRefuelIndex];

    let distance = 0;
    for (let j = previousRefuelIndex + 1; j <= i; j++) {
      distance += entriesAsc[j].distanceSinceLastEntry ?? 0;
    }

    const startFuelVolume = tankStateToVolume(previousRefuel.tankState, car);
    const addedVolume = entry.amountAdded ?? 0;
    const endFuelVolume = tankStateToVolume(entry.tankState, car);

    const fuelUsed = roundTo2(
      Math.max(startFuelVolume + addedVolume - endFuelVolume, 0),
    );

    const distanceRounded = roundTo2(distance);
    const consumption =
      distanceRounded > 0 ? roundTo2((fuelUsed / distanceRounded) * 100) : null;

    metrics[entry.id] = {
      entryId: entry.id,
      distanceSincePreviousRefuel: distanceRounded,
      fuelUsed,
      consumptionPer100Distance: consumption,
    };

    previousRefuelIndex = i;
  }

  return metrics;
}

export function getTankStateValidationError(value: number, car: Car) {
  if (!Number.isFinite(value)) {
    return "Please enter a valid tank state.";
  }

  if (car.fuelStateMode === "percent") {
    if (value < 0 || value > 100) {
      return "Tank state in percent must be between 0 and 100.";
    }
    return null;
  }

  if (value < 0 || value > car.tankCapacity) {
    return `Tank state in ${formatFuelVolumeUnitShortLabel(
      car.fuelVolumeUnit,
    )} must be between 0 and ${car.tankCapacity}.`;
  }

  return null;
}

export function getTankStateUnitLabel(car: Car) {
  if (car.fuelStateMode === "percent") return "%";
  return formatFuelVolumeUnitShortLabel(car.fuelVolumeUnit);
}

export function getTankStatePlaceholder(car: Car) {
  if (car.fuelStateMode === "percent") return "Example: 60";
  return `Example: ${car.tankCapacity}`;
}
