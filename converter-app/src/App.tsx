// import { useState } from 'react'
import { useAuth } from './auth/useAuth';
import Header from './components/Header'
import Body from './components/Body'
import Converter from './components/Converter'
import SaveCsvLayer from './pages/SaveCsvLayer'
import './App.css'

function App() {
  const {userInfo, token} = useAuth()
  const params = new URLSearchParams(window.location.search)
  const action = params.get('action')

  return (
    <>
      <div className="bg-image"></div>
      <div className="app-content">
        <Header />
        {token && userInfo ? (
          action === 'save-csv-layer' ? <SaveCsvLayer /> : <Converter />
        ) : (
          <Body />
        )}
      </div>
    </>
  );
}

export default App
