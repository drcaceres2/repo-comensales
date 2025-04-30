"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Import Select components
import { useRouter } from "next/navigation";

// Placeholder data - replace with actual fetch from Firestore
const availableResidences = [
  { id: 'res1', name: 'Residence A' },
  { id: 'res2', name: 'Residence B' },
  { id: 'res3', name: 'Central Hall' },
];

const MASTER_USER_VALUE = "__MASTER__";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedResidence, setSelectedResidence] = useState<string>('');

  const handleLogin = () => {
    // TODO: Implement actual login logic here
    // 1. Check if selectedResidence is MASTER_USER_VALUE
    //    - If yes, attempt master user login with email/password
    // 2. Else, attempt regular user login with email/password/selectedResidence
    console.log('Logging in with:', { email, password, residenceId: selectedResidence });

    // Placeholder navigation
    if (selectedResidence === MASTER_USER_VALUE) {
        // Redirect master user to appropriate dashboard (e.g., admin/residences)
        router.push("/admin/residences");
    } else if (selectedResidence) {
        // Redirect regular user (determine role and redirect accordingly later)
        router.push("/meal-schedule");
    } else {
        // Handle case where no residence is selected (show error?)
        alert("Please select a residence or 'Master User Login'.")
    }
  };

  return (
    <div className="flex items-center justify-center h-screen">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Log In</CardTitle>
          <CardDescription>
            Select your residence and enter your credentials.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="residencia">Residencia</Label>
            <Select value={selectedResidence} onValueChange={setSelectedResidence}>
              <SelectTrigger id="residencia">
                <SelectValue placeholder="Select Residence..." />
              </SelectTrigger>
              <SelectContent>
                {/* Removed the <SelectItem value="">Select Residence...</SelectItem> here */}
                <SelectItem value={MASTER_USER_VALUE}>Master User Login</SelectItem>
                {availableResidences.map((res) => (
                  <SelectItem key={res.id} value={res.id}>
                    {res.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button onClick={handleLogin} className="w-full"> {/* Added w-full for consistency */}
            Log In
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
