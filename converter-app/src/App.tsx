// import { useState } from 'react'
import { useAuth } from './auth/useAuth';
import Header from './components/Header'
import Body from './components/Body'
import Converter from './components/Converter'
import './App.css'

function App() {
  const {userInfo, token} = useAuth()

  return (
    <>
      <div className="bg-image"></div>
      <div className="app-content">
        <Header />
        {token && userInfo ? (
          <Converter />
        ) : (
          <Body />
        )}
      </div>
    </>
  );
}

export default App
