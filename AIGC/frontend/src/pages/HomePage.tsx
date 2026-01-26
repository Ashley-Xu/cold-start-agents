import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Cold-Start Video Generator
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Create professional multilingual story videos in minutes using AI.
            Generate 1000+ videos per month at <span className="font-semibold">less than $0.50 per video</span>.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Create Video Card */}
          <Link
            to="/create"
            className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow"
          >
            <div className="text-4xl mb-4">🎬</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Create New Video
            </h2>
            <p className="text-gray-600 mb-4">
              Generate a new video from your topic with AI-powered content creation and multi-stage approval.
            </p>
            <div className="text-blue-600 font-semibold">
              Get Started →
            </div>
          </Link>

          {/* Video Library Card */}
          <Link
            to="/library"
            className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-shadow"
          >
            <div className="text-4xl mb-4">📚</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Video Library
            </h2>
            <p className="text-gray-600 mb-4">
              Browse and manage all your generated videos. Download, share, or regenerate any video.
            </p>
            <div className="text-blue-600 font-semibold">
              View Library →
            </div>
          </Link>
        </div>

        {/* Features Section */}
        <div className="mt-16 max-w-4xl mx-auto">
          <h3 className="text-2xl font-bold text-center text-gray-900 mb-8">
            Key Features
          </h3>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg p-6 shadow">
              <div className="text-3xl mb-3">🤖</div>
              <h4 className="font-bold text-gray-900 mb-2">5 AI Agents</h4>
              <p className="text-sm text-gray-600">
                Story analysis, script writing, scene planning, asset generation, video assembly
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow">
              <div className="text-3xl mb-3">💰</div>
              <h4 className="font-bold text-gray-900 mb-2">Cost-Optimized</h4>
              <p className="text-sm text-gray-600">
                &lt;$0.35 per video using AI image generation + FFmpeg instead of expensive video APIs
              </p>
            </div>
            <div className="bg-white rounded-lg p-6 shadow">
              <div className="text-3xl mb-3">🎬</div>
              <h4 className="font-bold text-gray-900 mb-2">Multi-Stage Approval</h4>
              <p className="text-sm text-gray-600">
                Human oversight at script, storyboard, and asset stages before final render
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
