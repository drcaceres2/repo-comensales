// src/app/admin/residencia/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { collection, addDoc, Timestamp } from 'firebase/firestore';
// Import db directly from the new firebase config file
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Residencia, MealRequestSubmissionTimes } from '@/models/firestore';

// db is already initialized and imported from @/lib/firebase

const daysOfWeek = [
  { label: 'Monday', value: 'lunes' },
  { label: 'Tuesday', value: 'martes' },
  { label: 'Wednesday', value: 'miercoles' },
  { label: 'Thursday', value: 'jueves' },
  { label: 'Friday', value: 'viernes' },
  { label: 'Saturday', value: 'sabado' },
  { label: 'Sunday', value: 'domingo' },
] as const;

type DayOfWeekKey = typeof daysOfWeek[number]['value'];

export default function ResidenciaAdminPage() {
  const [isClient, setIsClient] = useState(false);
  const [residenceName, setResidenceName] = useState('');
  const [requestTimes, setRequestTimes] = useState<Partial<Record<DayOfWeekKey, string>>>({});
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setIsClient(true);
  }, []);

  const handleTimeChange = (day: DayOfWeekKey, value: string) => {
    setRequestTimes(prev => ({ ...prev, [day]: value }));
  };

  const handleCreateResidence = async () => {
    if (!residenceName.trim()) {
      toast({ title: "Error", description: "Residence name cannot be empty.", variant: "destructive" });
      return;
    }
    if (Object.keys(requestTimes).length === 0) {
      toast({ title: "Error", description: "Please set at least one meal request submission time.", variant: "destructive" });
      return;
    }

    setIsCreating(true);

    try {
      const submissionTimes: Partial<MealRequestSubmissionTimes> = {};
      for (const day in requestTimes) {
        if (requestTimes[day as DayOfWeekKey]) {
          const dateTimeString = requestTimes[day as DayOfWeekKey];
          if (dateTimeString) {
            const date = new Date(dateTimeString);
            if (!isNaN(date.getTime())) {
              submissionTimes[day as DayOfWeekKey] = Timestamp.fromDate(date);
            } else {
              console.warn(`Invalid date-time format for ${day}: ${dateTimeString}`);
              toast({ title: "Warning", description: `Invalid date-time format for ${day}: ${dateTimeString}. Skipping this day.`, variant: "destructive" });
            }
          }
        }
      }

      if (Object.keys(submissionTimes).length === 0 && Object.keys(requestTimes).some(k => requestTimes[k as DayOfWeekKey])) {
        toast({ title: "Error", description: "No valid submission times could be processed. Please check the date/time format.", variant: "destructive" });
        setIsCreating(false);
        return;
      }

      const newResidenceData: Omit<Residencia, 'id'> = {
        nombre: residenceName.trim(),
        mealRequestSubmissionTimes: submissionTimes as MealRequestSubmissionTimes,
      };

      // Use the imported db directly
      const docRef = await addDoc(collection(db, "residencias"), newResidenceData);

      toast({ title: "Success", description: `Residence "${residenceName}" created successfully with ID: ${docRef.id}` });
      setResidenceName('');
      setRequestTimes({});

    } catch (error) {
      console.error("Error creating residence: ", error);
      toast({ title: "Error", description: `Failed to create residence. ${error instanceof Error ? error.message : 'Unknown error'}`, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Manage Residences</h1>
      <Tabs defaultValue="create" className="w-full">
        <TabsList>
          <TabsTrigger value="create">Create Residence</TabsTrigger>
          <TabsTrigger value="list">Existing Residences</TabsTrigger>
        </TabsList>
        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create New Residence</CardTitle>
              <CardDescription>Enter the details for the new residence.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isClient ? (
                <>
                  <Skeleton className="h-10 w-1/3" />
                  <Skeleton className="h-6 w-1/4" />
                  <Skeleton className="h-6 w-1/3" />
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-16" />)}
                  </div>
                  <Skeleton className="h-10 w-24" />
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="residence-name">Residence Name</Label>
                    <Input
                      id="residence-name"
                      placeholder="e.g., Residencia Central"
                      value={residenceName}
                      onChange={(e) => setResidenceName(e.target.value)}
                      disabled={isCreating}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Meal Request Submission Times</Label>
                    <CardDescription>Set the deadline date and time for each day when meal requests must be submitted.</CardDescription>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {daysOfWeek.map(day => (
                        <div key={day.value} className="grid gap-2">
                          <Label htmlFor={`time-${day.value}`}>{day.label}</Label>
                          <Input
                            id={`time-${day.value}`}
                            type="datetime-local"
                            value={requestTimes[day.value] || ''}
                            onChange={(e) => handleTimeChange(day.value, e.target.value)}
                            disabled={isCreating}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button onClick={handleCreateResidence} disabled={isCreating}>
                    {isCreating ? 'Creating...' : 'Create Residence'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>Existing Residences</CardTitle>
              <CardDescription>View and manage existing residences and their related settings.</CardDescription>
            </CardHeader>
            <CardContent>
              {!isClient ? (
                <Skeleton className="h-6 w-1/2" />
              ) : (
                <p>List of existing residences and management options will go here. (Implementation needed)</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
