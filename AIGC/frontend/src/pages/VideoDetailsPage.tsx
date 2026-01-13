import { Link, useParams } from 'react-router-dom'

export default function VideoDetailsPage() {
  const { videoId } = useParams<{ videoId: string }>()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Link to="/library" className="text-blue-600 hover:underline">
            ← Back to Library
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          Video Details
        </h1>

        <div className="bg-white rounded-lg shadow p-8">
          <p className="text-gray-600">
            Video ID: {videoId}
          </p>
          <p className="text-gray-600 mt-4">
            Video details page coming soon.
          </p>
        </div>
      </div>
    </div>
  )
}
