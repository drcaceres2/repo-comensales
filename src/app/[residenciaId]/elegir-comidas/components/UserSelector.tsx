"use client";

import React from 'react';
import { UserProfile } from '../../../../../shared/models/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface UserSelectorProps {
  availableUsers: UserProfile[];
  selectedUser: UserProfile | null;
  onUserChange: (userId: string) => void;
  loading: boolean;
}

const UserSelector: React.FC<UserSelectorProps> = ({
  availableUsers,
  selectedUser,
  onUserChange,
  loading,
}) => {

  if (loading) {
    return <div>Cargando usuarios...</div>;
  }

  if (availableUsers.length === 0) {
    return <div>No hay usuarios disponibles para seleccionar.</div>;
  }

  if (availableUsers.length === 1) {
    return (
      <div className="p-2">
        <span className="font-semibold">Usuario:</span> {availableUsers[0].nombreCorto || availableUsers[0].email}
      </div>
    );
  }

  return (
    <div className="p-2">
        <Select value={selectedUser?.id || ""} onValueChange={onUserChange}>
            <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Seleccione un usuario" />
            </SelectTrigger>
            <SelectContent>
                {availableUsers.map(user => (
                <SelectItem key={user.id} value={user.id}>
                    {user.nombreCorto || user.email}
                </SelectItem>
                ))}
            </SelectContent>
        </Select>
    </div>
  );
};

export default UserSelector;
