import React, { createContext, useContext, useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ rol, id_usuario, children }) => {
  const [connected, setConnected] = useState(false);
  const [noLeidos, setNoLeidos] = useState(0);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const socket = new window.io(API_BASE, {
      transports: ['websocket'],
      auth: {
        token: localStorage.getItem('token')
      }
    });

    setSocket(socket);

    socket.on('connect', () => {
      setConnected(true);
      if (rol && id_usuario) {
        socket.emit('join_room', { rol, id_usuario });
        socket.emit('solicitar_contador');
      }
    });

    socket.on('contador_no_leidos', (data) => {
      setNoLeidos(data?.count || 0);
    });

    socket.on('contador_actualizado', (data) => {
      setNoLeidos(data?.count || 0);
    });

    socket.on('nueva_notificacion', (data) => {
      setNoLeidos(prev => prev + 1);
    });

    socket.on('nuevo_mensaje', (data) => {
      console.log('Nuevo mensaje recibido:', data);
      setNoLeidos(prev => prev + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, [rol, id_usuario]);

  return (
    <SocketContext.Provider value={{ connected, noLeidos, socket }}>
      {children}
    </SocketContext.Provider>
  );
};