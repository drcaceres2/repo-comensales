import React, { useState, useEffect, ChangeEvent } from 'react';

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

// Interface for the props of the TimezoneSelector component
export interface TimezoneSelectorProps {
  initialTimezone?: string; // e.g., "America/New_York"
  onTimezoneChange: (timezone: string) => void;
  timezonesData: TimezonesData;
  disabled?: boolean;
  label?: string;
  selectClassName?: string;
  labelClassName?: string;
  containerClassName?: string;
}

const TimezoneSelector: React.FC<TimezoneSelectorProps> = ({
  initialTimezone,
  onTimezoneChange,
  timezonesData,
  disabled = false,
  label,
  selectClassName = "w-full p-2 border rounded mt-1 bg-background text-foreground",
  labelClassName = "block text-sm font-medium text-gray-700",
  containerClassName = "mb-4"
}) => {
  const [selectedRegion, setSelectedRegion] = useState<string>("");
  const [selectedCity, setSelectedCity] = useState<string>("");

  useEffect(() => {
    if (initialTimezone && timezonesData) {
      const parts = initialTimezone.split('/');
      const region = parts[0];
      const city = parts.slice(1).join('/'); // City can contain '/'

      if (region && timezonesData[region]) {
        setSelectedRegion(region);
        if (city && timezonesData[region].find(tz => tz.name === city)) {
          setSelectedCity(city);
        } else {
          setSelectedCity(""); // Reset city if not found in new region or initial city is invalid
        }
      } else {
        // If region from initialTimezone is not in our list, reset both
        setSelectedRegion("");
        setSelectedCity("");
      }
    } else {
      // No initial timezone, or no data, reset
      setSelectedRegion("");
      setSelectedCity("");
    }
  }, [initialTimezone, timezonesData]);

  // Event handler for region selection
  const handleRegionChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const newRegion = e.target.value;
    setSelectedRegion(newRegion);
    setSelectedCity(""); // Reset city when region changes
    // If newRegion is empty, it means "Select a region..." was chosen.
    if (!newRegion) {
      onTimezoneChange(""); // Notify parent that selection is incomplete
    }
  };

  // Event handler for city selection
  const handleCityChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const newCity = e.target.value;
    setSelectedCity(newCity);
    // If newCity is empty, it means "Select a city/area..." was chosen.
    // The effect below will handle calling onTimezoneChange.
  };

  // useEffect to call onTimezoneChange when a valid city in a valid region is selected
  useEffect(() => {
    if (selectedRegion && selectedCity && timezonesData[selectedRegion]?.find(tz => tz.name === selectedCity)) {
      onTimezoneChange(`${selectedRegion}/${selectedCity}`);
    } else if (!selectedRegion || !selectedCity) {
      // If either region or city is reset to an empty string (e.g., "Select...")
      // and was not handled by handleRegionChange directly for an empty region.
      onTimezoneChange("");
    }
    // Adding timezonesData to dependencies in case it changes and selected values become invalid,
    // though this is less common for this prop.
  }, [selectedRegion, selectedCity, onTimezoneChange, timezonesData]);

  // --- JSX for selects will follow ---

  return (
    <div className={containerClassName}>
      {label && <label htmlFor="timezone-region-selector" className={labelClassName}>{label}</label>}
      <select
        id="timezone-region-selector"
        value={selectedRegion}
        onChange={handleRegionChange}
        disabled={disabled}
        className={selectClassName}
      >
        <option value="">-- Select Region --</option>
        {Object.keys(timezonesData).sort().map(region => (
          <option key={region} value={region}>
            {region}
          </option>
        ))}
      </select>

      <select
        id="timezone-city-selector"
        value={selectedCity}
        onChange={handleCityChange}
        disabled={disabled || !selectedRegion || !timezonesData[selectedRegion] || timezonesData[selectedRegion]?.length === 0}
        className={`${selectClassName} mt-2`} // Added margin-top for spacing
      >
        <option value="">-- Select City/Area --</option>
        {selectedRegion && timezonesData[selectedRegion] ? (
          timezonesData[selectedRegion]
            .sort((a, b) => a.name.localeCompare(b.name)) // Sort cities alphabetically by name
            .map(tz => (
              <option key={tz.name} value={tz.name}>
                {tz.name} {tz.offset ? `(${tz.offset})` : ''}
              </option>
            ))
        ) : null}
      </select>
    </div>
  );
};

export default TimezoneSelector;
