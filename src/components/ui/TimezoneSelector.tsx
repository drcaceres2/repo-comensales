import React, { useState, useEffect, ChangeEvent } from 'react';
import timezonesDataJson from '@/../../shared/data/zonas_horarias_soportadas.json'; // Import the JSON data
const DEFAULT_TIMEZONE_STRING = "America/Tegucigalpa";

// Interface for individual timezone details (name and offset)
export interface TimezoneDetail {
  name: string;
  offset: string; // Assuming offset is a string like "+05:00" or "GMT-7"
  // Add other properties if they exist in your zonas_horarias_ejemplos.json
}

// Interface for the overall timezones data structure (imported JSON)
export interface TimezonesData {
  [region: string]: TimezoneDetail[];
}

// Cast the imported JSON to our TimezonesData interface
const timezonesData: TimezonesData = timezonesDataJson as TimezonesData;

// Interface for the props of the TimezoneSelector component
export interface TimezoneSelectorProps {
  initialTimezone?: string; // e.g., "America/New_York"
  onTimezoneChange: (timezone: string) => void;
  disabled?: boolean;
  label?: string;
  selectClassName?: string;
  labelClassName?: string;
  containerClassName?: string;
}

const TimezoneSelector: React.FC<TimezoneSelectorProps> = ({
  initialTimezone,
  onTimezoneChange,
  disabled = false,
  label,
  selectClassName = "w-full p-2 border rounded mt-1 bg-background text-foreground",
  labelClassName = "block text-sm font-medium text-gray-700 dark:text-gray-300", // Added dark mode suggestion
  containerClassName = "mb-4"
}) => {
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("");

  useEffect(() => {
    let regionToSet = "";
    let cityToSet = "";

    // Helper to attempt parsing and validating a timezone string
    const parseAndValidateTimezone = (tzString: string | undefined): boolean => {
      if (!tzString) return false;
      
      const parts = tzString.split('/');
      const region = parts[0];
      const city = parts.slice(1).join('/'); // City can contain '/'

      // Check if the region exists and the city is found within that region's timezones
      if (region && timezonesData[region] && city && timezonesData[region].find(tz => tz.name === city)) {
        regionToSet = region;
        cityToSet = city;
        return true;
      }
      return false;
    };

    // 1. Try to set timezone from the initialTimezone prop
    if (!parseAndValidateTimezone(initialTimezone)) {
      // 2. If initialTimezone was not provided or was invalid,
      //    attempt to set timezone from DEFAULT_TIMEZONE_STRING.
      //    If this also fails (e.g., default string is somehow not in the JSON),
      //    regionToSet and cityToSet will remain "", leading to "-- Select --" in dropdowns.
      parseAndValidateTimezone(DEFAULT_TIMEZONE_STRING);
    }

    setSelectedRegion(regionToSet);
    setSelectedCity(cityToSet);

  }, [initialTimezone]); // timezonesData is a module constant and doesn't need to be a dependency

  // useEffect to call onTimezoneChange when a valid city in a valid region is selected
  useEffect(() => {
    if (selectedRegion && selectedCity && timezonesData[selectedRegion]?.find(tz => tz.name === selectedCity)) {
      onTimezoneChange(`${selectedRegion}/${selectedCity}`);
    } else if (!selectedRegion || !selectedCity) {
      // Call with empty string if selection is incomplete or invalid
      // This might happen if initialTimezone was invalid or selections are reset
      onTimezoneChange("");
    }
  }, [selectedRegion, selectedCity, onTimezoneChange]);

  const handleRegionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedRegion(event.target.value);
    setSelectedCity(""); // Reset city when region changes
  };

  const handleCityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedCity(event.target.value);
  };

  const availableRegions = Object.keys(timezonesData);
  const availableCities = selectedRegion ? timezonesData[selectedRegion] : [];

  return (
    <div className={containerClassName}>
      {label && <label className={labelClassName}>{label}</label>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select
          value={selectedRegion}
          onChange={handleRegionChange}
          disabled={disabled}
          className={selectClassName}
          aria-label="Select timezone region"
        >
          <option value="">-- Select Region --</option>
          {availableRegions.map(region => (
            <option key={region} value={region}>{region.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={selectedCity}
          onChange={handleCityChange}
          disabled={disabled || !selectedRegion}
          className={selectClassName}
          aria-label="Select timezone city"
        >
          <option value="">-- Select City --</option>
          {availableCities.map(tz => (
            <option key={tz.name} value={tz.name}>
              {tz.name.replace(/_/g, ' ')} ({tz.offset})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default TimezoneSelector;
