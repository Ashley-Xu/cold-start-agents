import { Link } from 'react-router-dom'

export default function VideoLibraryPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Link to="/" className="text-blue-600 hover:underline">
            ← Back to Home
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Video Library
        </h1>

        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-600 mb-4">
            Video library coming soon. This page will display all your generated videos.
          </p>
          <Link
            to="/create"
            className="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Your First Video
          </Link>
        </div>
      </div>
    </div>
  )
}
