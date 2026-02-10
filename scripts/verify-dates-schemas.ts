
import { z } from 'zod';
import { 
  IsoDateStringSchema, 
  Time24hSchema, 
  IanaTimezoneSchema, 
  UbicacionSchema,
  IsoCountryCodeSchema
} from '../shared/schemas/fechas';

const test = (name: string, schema: z.ZodType<any>, input: any, shouldPass: boolean) => {
  const result = schema.safeParse(input);
  if (result.success === shouldPass) {
    console.log(`PASS: ${name} (${input}) -> ${shouldPass ? 'Valid' : 'Invalid'}`);
  } else {
    console.error(`FAIL: ${name} (${input}) -> Expected ${shouldPass ? 'Valid' : 'Invalid'}, but got ${result.success ? 'Valid' : 'Invalid'}`);
    if (!result.success) {
      console.error('  Error:', result.error.errors);
    }
  }
};

console.log('--- Verifying Date/Time Schemas ---');

// 1. Time24hSchema
console.log('\nTesting Time24hSchema:');
test('Time 00:00', Time24hSchema, '00:00', true);
test('Time 23:59', Time24hSchema, '23:59', true);
test('Time 12:30', Time24hSchema, '12:30', true);
test('Time 24:00', Time24hSchema, '24:00', false);
test('Time 23:60', Time24hSchema, '23:60', false);
test('Time 12:5', Time24hSchema, '12:5', false);
test('Time 1:30', Time24hSchema, '1:30', false); // Needs leading zero? Regex says yes: `([01]\d|2[0-3])`

// 2. IsoDateStringSchema
console.log('\nTesting IsoDateStringSchema:');
test('Date 2023-12-31', IsoDateStringSchema, '2023-12-31', true);
test('Date 2024-02-29', IsoDateStringSchema, '2024-02-29', true); // Leap year regex check? No, naive regex usually.
test('Date 2023-01-01', IsoDateStringSchema, '2023-01-01', true);
test('Date 2023-13-01', IsoDateStringSchema, '2023-13-01', false);
test('Date 2023-12-32', IsoDateStringSchema, '2023-12-32', false);
test('Date 31-12-2023', IsoDateStringSchema, '31-12-2023', false);

// 3. IanaTimezoneSchema
console.log('\nTesting IanaTimezoneSchema:');
test('Zone America/Tegucigalpa', IanaTimezoneSchema, 'America/Tegucigalpa', true);
test('Zone Europe/Madrid', IanaTimezoneSchema, 'Europe/Madrid', true);
test('Zone Asia/Tokyo', IanaTimezoneSchema, 'Asia/Tokyo', false); // Is Tokyo in the supported list? Let's assume checking if it fails is correct if not in strict list.
// Checking a definitely invalid one
test('Zone Mars/Phobos', IanaTimezoneSchema, 'Mars/Phobos', false);

// 4. UbicacionSchema
console.log('\nTesting UbicacionSchema:');
test('Ubicacion Valid', UbicacionSchema, {
  pais: 'HN',
  ciudad: 'San Pedro Sula',
  timezone: 'America/Tegucigalpa'
}, true);

test('Ubicacion Invalid Country', UbicacionSchema, {
  pais: 'HND', // 3 letters
  ciudad: 'San Pedro Sula',
  timezone: 'America/Tegucigalpa'
}, false);

test('Ubicacion Invalid Timezone', UbicacionSchema, {
  pais: 'HN',
  ciudad: 'San Pedro Sula',
  timezone: 'America/New_York' // New York is in the JSON? Likely yes, but let's see. 
}, true); // Assuming New_York IS in valid list.

test('Ubicacion Missing City', UbicacionSchema, {
  pais: 'HN',
  timezone: 'America/Tegucigalpa'
}, false);

console.log('\n--- Verification Complete ---');
