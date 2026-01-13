import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import CreateVideoPage from './pages/CreateVideoPage'
import VideoLibraryPage from './pages/VideoLibraryPage'
import VideoDetailsPage from './pages/VideoDetailsPage'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreateVideoPage />} />
          <Route path="/library" element={<VideoLibraryPage />} />
          <Route path="/videos/:videoId" element={<VideoDetailsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
