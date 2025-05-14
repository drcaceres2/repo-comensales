'use client';

import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Button } from '@/components/ui/button'; // Assuming you have a Button component
import { useToast } from '@/hooks/use-toast'; // Assuming you have a toast hook

export default function CreateMasterUserPage() {
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const functions = getFunctions(); // Make sure Firebase is initialized in your app

    // Get a reference to the new hardcoded master user creation function
    const createHardcodedMasterUserCallable = httpsCallable(functions, 'createHardcodedMasterUser');

    const handleCreateHardcodedMasterUser = async () => {
        setIsLoading(true);
        toast({ title: 'Attempting to create hardcoded master user...' });

        try {
            const result = await createHardcodedMasterUserCallable({}); // No data needs to be passed
            // The type of result.data will be any, but you can cast if you expect a specific structure
            const data = result.data as { success: boolean; userId?: string; message: string };

            if (data.success) {
                toast({
                    title: 'Success!',
                    description: data.message + (data.userId ? ` (ID: ${data.userId})` : ''),
                    variant: 'default',
                });
                console.log('Hardcoded master user creation successful:', data);
            } else {
                toast({
                    title: 'Operation Warning',
                    description: data.message || 'Could not create hardcoded master user.',
                    variant: 'destructive',
                });
                console.warn('Hardcoded master user creation warning:', data);
            }
        } catch (error: any) {
            console.error('Error calling createHardcodedMasterUser function:', error);
            toast({
                title: 'Error Creating Master User',
                description: error.message || 'An unexpected error occurred.',
                variant: 'destructive',
            });
        }
        setIsLoading(false);
    };

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-2xl font-bold mb-4">Create Hardcoded Master User (Local Dev Only)</h1>
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 mb-6" role="alert">
                <p className="font-bold">Security Warning</p>
                <p>
                    This page calls a function that creates a master user with hardcoded credentials.
                    It is **EXTREMELY INSECURE** and intended **ONLY** for initial local development setup.
                </p>
                <p className="mt-2">
                    **ACTION REQUIRED:** You MUST delete the <code className="bg-yellow-200 p-1 rounded">createHardcodedMasterUser</code> Firebase Function
                    and remove or secure this client-side page before deploying to any non-local environment.
                </p>
            </div>

            <p className="mb-4">
                Clicking the button below will attempt to create a master user with credentials hardcoded
                in the <code className="bg-gray-200 p-1 rounded">functions/src/index.ts</code> file:
                <ul className="list-disc list-inside ml-4 my-2">
                    <li>Email: <code className="bg-gray-200 p-1 rounded">master@default.com</code></li>
                    <li>Password: <code className="bg-gray-200 p-1 rounded">password123</code></li>
                </ul>
                Check the Firebase Emulator logs for details.
            </p>

            <Button onClick={handleCreateHardcodedMasterUser} disabled={isLoading}>
                {isLoading ? 'Processing...' : 'Create Hardcoded Master User'}
            </Button>

            <div className="mt-8 p-4 border border-gray-300 rounded">
                <h2 className="text-xl font-semibold mb-2">Next Steps After Local Setup:</h2>
                <ol className="list-decimal list-inside space-y-1">
                    <li>Verify the master user is created in the Firebase Emulator (Auth & Firestore).</li>
                    <li>Log in with the hardcoded master user credentials.</li>
                    <li>Use the standard admin interface to create any other necessary users (admins, regular users).</li>
                    <li>
                        **CRITICAL:** Delete the <code className="bg-red-200 p-1 rounded">createHardcodedMasterUser</code> function from
                        <code className="bg-gray-200 p-1 rounded">functions/src/index.ts</code>.
                    </li>
                    <li>
                        **CRITICAL:** Delete or secure this client-side page
                        (<code className="bg-gray-200 p-1 rounded">src/app/create-master-user/page.tsx</code>).
                    </li>
                    <li>Proceed with developing your application with secure user management functions.</li>
                </ol>
            </div>
        </div>
    );
}
