'use client';

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { auth, db } from '@/lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { UserProfile, UserRole } from '@/models/firestore';
import { Loader2 } from 'lucide-react';

export default function CreateMasterUserPage() {
    const { toast } = useToast();
    const [email, setEmail] = useState('drcaceres@gmail.com');
    const [password, setPassword] = useState('123456');
    const [nombre, setNombre] = useState('Daniel');
    const [apellido, setApellido] = useState('Caceres');
    const [isLoading, setIsLoading] = useState(false);

    const handleCreateMasterUser = async () => {
        if (!email || !password || !nombre || !apellido) {
            toast({
                title: "Missing Fields",
                description: "Please fill in all fields.",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            // 1. Create user in Firebase Authentication
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const authUser = userCredential.user;
            console.log('User created in Auth:', authUser.uid);

            // 2. Create user profile in Firestore
            const userProfileData: UserProfile = {
                id: authUser.uid, // Use auth UID as Firestore doc ID
                nombre: nombre,
                apellido: apellido,
                email: email,
                roles: ['master' as UserRole], // Assign 'master' role
                isActive: true,
                // Optional fields from UserProfile can be added here if needed
                // residenciaId: undefined, 
                // dietaId: undefined,
            };

            await setDoc(doc(db, "users", authUser.uid), userProfileData);
            console.log('User profile created in Firestore for UID:', authUser.uid);

            toast({
                title: "Master User Created",
                description: `User ${email} created successfully with master role. You can now log in with these credentials.`,
            });

        } catch (error: any) {
            console.error("Error creating master user:", error);
            let errorMessage = error.message || "An unknown error occurred.";
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "This email is already in use. Please try logging in or use a different email.";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "The password is too weak. Please use a stronger password (at least 6 characters).";
            }
            toast({
                title: "Error Creating User",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md dark:bg-gray-800">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Create Master User</h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        For development: create a master user for the application.
                    </p>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <Label htmlFor="nombre" className="text-sm font-medium text-gray-700 dark:text-gray-300">Nombre</Label>
                        <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Daniel" className="mt-1" />
                    </div>
                    <div>
                        <Label htmlFor="apellido" className="text-sm font-medium text-gray-700 dark:text-gray-300">Apellido</Label>
                        <Input id="apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} placeholder="Caceres" className="mt-1" />
                    </div>
                    <div>
                        <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</Label>
                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="drcaceres@gmail.com" className="mt-1" />
                    </div>
                    <div>
                        <Label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">Password</Label>
                        <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" className="mt-1" />
                    </div>
                </div>

                <Button onClick={handleCreateMasterUser} disabled={isLoading} className="w-full py-2.5">
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isLoading ? 'Creating User...' : 'Create Master User'}
                </Button>
                <p className="mt-4 text-xs text-center text-gray-500 dark:text-gray-400">
                    Ensure Firebase emulators (Auth & Firestore) are running.
                </p>
            </div>
        </div>
    );
}
