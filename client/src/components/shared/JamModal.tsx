import React, { useState } from 'react';
import { useJamModalStore } from '../../store/modal-store';
import { IoClose } from 'react-icons/io5';
import useJamStore from '../../store/jam-store';
import { useAuthStore } from '../../store/auth-store';

export const JamModal: React.FC = () => {
  const { isOpen, close } = useJamModalStore();
  const { startJam, joinJam } = useJamStore((state) => state.actions);
  const { accessToken } = useAuthStore();
  const [joinCode, setJoinCode] = useState('');
  const [songId, setSongId] = useState('');

  const handleStartJam = () => {
    if (accessToken && songId) {
      startJam(songId, accessToken);
      close();
    }
  };

  const handleJoinJam = () => {
    if (accessToken && joinCode) {
      joinJam(joinCode, accessToken);
      close();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Jam Session</h2>
          <button onClick={close} className="text-gray-500 hover:text-gray-700">
            <IoClose size={24} />
          </button>
        </div>
        <div>
          {/* Start a new Jam Session */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">Start a New Jam</h3>
            <p className="text-sm text-gray-600 mb-4">Start a new session and invite your friends to listen along.</p>
            <input
              type="text"
              placeholder="Enter Song ID"
              value={songId}
              onChange={(e) => setSongId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              onClick={handleStartJam}
              className="w-full bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600 transition-colors"
            >
              Start Jam
            </button>
          </div>

          {/* Join a Jam Session */}
          <div>
            <h3 className="text-lg font-semibold mb-2">Join a Jam</h3>
            <p className="text-sm text-gray-600 mb-4">Enter a Jam Code to join an existing session.</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter Jam Code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className="flex-grow border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                onClick={handleJoinJam}
                className="bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};