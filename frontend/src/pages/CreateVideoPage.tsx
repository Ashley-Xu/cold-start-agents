import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import * as api from '../lib/api'
import type {
  Language,
  VideoDuration,
  StoryAnalysis,
  Script,
  Storyboard,
  Asset,
  Video,
} from '../lib/types'

// Mock user ID for now (in a real app, this would come from auth)
const MOCK_USER_ID = 'user-demo-123'

type Step =
  | 'input'
  | 'analyzing'
  | 'script_review'
  | 'storyboard_review'
  | 'assets_review'
  | 'rendering'
  | 'complete'

export default function CreateVideoPage() {
  const [currentStep, setCurrentStep] = useState<Step>('input')
  const [videoId, setVideoId] = useState<string | null>(null)
  const [totalCost, setTotalCost] = useState(0)

  // Form inputs
  const [topic, setTopic] = useState('')
  const [language, setLanguage] = useState<Language>('en')
  const [duration, setDuration] = useState<VideoDuration>(30)

  // AI generated content
  const [storyAnalysis, setStoryAnalysis] = useState<StoryAnalysis | null>(null)
  const [script, setScript] = useState<Script | null>(null)
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null)
  const [assets, setAssets] = useState<Asset[] | null>(null)
  const [video, setVideo] = useState<Video | null>(null)

  // Feedback inputs
  const [analysisFeedback, setAnalysisFeedback] = useState('')
  const [scriptRevisionNotes, setScriptRevisionNotes] = useState('')
  const [editedScenePrompts, setEditedScenePrompts] = useState<Record<string, string>>({})
  const [regeneratingAssetIndex, setRegeneratingAssetIndex] = useState<number | null>(null)

  // Editing modes
  const [isEditingScript, setIsEditingScript] = useState(false)
  const [editedScript, setEditedScript] = useState<any>(null)
  const [isEditingStoryboard, setIsEditingStoryboard] = useState(false)
  const [editedStoryboard, setEditedStoryboard] = useState<any>(null)

  // ===== Mutations =====

  const createVideoMutation = useMutation({
    mutationFn: () =>
      api.createVideo({
        topic,
        language,
        duration,
        isPremium: false,
        userId: MOCK_USER_ID,
      }),
    onSuccess: (data) => {
      setVideoId(data.videoId)
      setCurrentStep('analyzing')
      analyzeStoryMutation.mutate({ vid: data.videoId })
    },
  })

  const analyzeStoryMutation = useMutation({
    mutationFn: ({ vid, feedback }: { vid: string; feedback?: string }) =>
      api.analyzeStory(vid, feedback),
    onSuccess: (data) => {
      setStoryAnalysis(data)
      setTotalCost((prev) => prev + 0.0001)
      setCurrentStep('script_review')
      setAnalysisFeedback('') // Clear feedback after successful regeneration
    },
  })

  const generateScriptMutation = useMutation({
    mutationFn: () => api.generateScript(videoId!),
    onSuccess: (data) => {
      setScript(data)
      setTotalCost((prev) => prev + 0.0003)
    },
  })

  const approveScriptMutation = useMutation({
    mutationFn: ({ approved, revisionNotes }: { approved: boolean; revisionNotes?: string }) =>
      api.approveScript(videoId!, { approved, revisionNotes }),
    onSuccess: (data, variables) => {
      if (variables.approved) {
        setCurrentStep('storyboard_review')
        generateStoryboardMutation.mutate()
      }
      // If rejected, stay on same step for regeneration
    },
  })

  const generateStoryboardMutation = useMutation({
    mutationFn: () => api.generateStoryboard(videoId!),
    onSuccess: (data) => {
      setStoryboard(data)
      setTotalCost((prev) => prev + 0.0001)
    },
  })

  const approveStoryboardMutation = useMutation({
    mutationFn: (approved: boolean) =>
      api.approveStoryboard(videoId!, approved),
    onSuccess: () => {
      setCurrentStep('assets_review')
      generateAssetsMutation.mutate()
    },
  })

  const generateAssetsMutation = useMutation({
    mutationFn: () => api.generateAssets(videoId!),
    onSuccess: (data) => {
      setAssets(data.assets)
      setTotalCost((prev) => prev + data.totalCost)
    },
  })

  const approveAssetsMutation = useMutation({
    mutationFn: (approved: boolean) =>
      api.approveAssets(videoId!, approved),
    onSuccess: () => {
      setCurrentStep('rendering')
      renderVideoMutation.mutate()
    },
  })

  const renderVideoMutation = useMutation({
    mutationFn: () => api.renderVideo(videoId!),
    onSuccess: (data) => {
      setVideo(data)
      setTotalCost((prev) => prev + data.cost)
      setCurrentStep('complete')
    },
  })

  // ===== Handlers =====

  const handleSubmitTopic = (e: React.FormEvent) => {
    e.preventDefault()
    if (!topic.trim()) return
    createVideoMutation.mutate()
  }

  const handleGenerateScript = () => {
    generateScriptMutation.mutate()
  }

  const handleApproveScript = () => {
    approveScriptMutation.mutate({ approved: true })
  }

  const handleRequestScriptRevision = () => {
    approveScriptMutation.mutate(
      { approved: false, revisionNotes: scriptRevisionNotes },
      {
        onSuccess: () => {
          setScript(null)
          setScriptRevisionNotes('')
          generateScriptMutation.mutate() // Regenerate with revision notes
        },
      }
    )
  }

  const handleApproveStoryboard = () => {
    approveStoryboardMutation.mutate(true)
  }

  const handleApproveAssets = () => {
    approveAssetsMutation.mutate(true)
  }

  // ===== Back Navigation Handlers =====

  const handleBackFromScriptReview = () => {
    setCurrentStep('input')
  }

  const handleBackFromStoryboardReview = () => {
    setCurrentStep('script_review')
  }

  const handleBackFromAssetsReview = () => {
    setCurrentStep('storyboard_review')
  }

  const handleBackToInput = () => {
    setCurrentStep('input')
  }

  const handleBackToScriptReview = () => {
    setCurrentStep('script_review')
  }

  const handleBackToStoryboardReview = () => {
    setCurrentStep('storyboard_review')
  }

  const handleBackToAssetsReview = () => {
    setCurrentStep('assets_review')
  }

  // ===== Script Editing Handlers =====

  const handleEnableScriptEdit = () => {
    setIsEditingScript(true)
    setEditedScript(script ? JSON.parse(JSON.stringify(script)) : null)
  }

  const handleCancelScriptEdit = () => {
    setIsEditingScript(false)
    setEditedScript(null)
  }

  const handleSaveScriptEdit = () => {
    if (editedScript) {
      setScript(editedScript)
      setIsEditingScript(false)
      setEditedScript(null)
    }
  }

  const handleSceneNarrationChange = (sceneId: string, newNarration: string) => {
    if (editedScript) {
      setEditedScript({
        ...editedScript,
        scenes: editedScript.scenes.map((s: any) =>
          s.id === sceneId ? { ...s, narration: newNarration } : s
        ),
      })
    }
  }

  // ===== Storyboard Editing Handlers =====

  const handleEnableStoryboardEdit = () => {
    setIsEditingStoryboard(true)
    setEditedStoryboard(storyboard ? JSON.parse(JSON.stringify(storyboard)) : null)
  }

  const handleCancelStoryboardEdit = () => {
    setIsEditingStoryboard(false)
    setEditedStoryboard(null)
  }

  const handleSaveStoryboardEdit = () => {
    if (editedStoryboard) {
      setStoryboard(editedStoryboard)
      setIsEditingStoryboard(false)
      setEditedStoryboard(null)
    }
  }

  const handleSceneImagePromptChange = (sceneId: string, newPrompt: string) => {
    if (editedStoryboard) {
      setEditedStoryboard({
        ...editedStoryboard,
        scenes: editedStoryboard.scenes.map((s: any) =>
          s.id === sceneId ? { ...s, imagePrompt: newPrompt } : s
        ),
      })
    }
  }

  const handleSceneDescriptionChange = (sceneId: string, newDescription: string) => {
    if (editedStoryboard) {
      setEditedStoryboard({
        ...editedStoryboard,
        scenes: editedStoryboard.scenes.map((s: any) =>
          s.id === sceneId ? { ...s, description: newDescription } : s
        ),
      })
    }
  }

  // ===== Render Functions =====

  const renderStepIndicator = () => {
    const steps = [
      { id: 'input', label: 'Topic' },
      { id: 'analyzing', label: 'Analyze' },
      { id: 'script_review', label: 'Script' },
      { id: 'storyboard_review', label: 'Storyboard' },
      { id: 'assets_review', label: 'Assets' },
      { id: 'rendering', label: 'Render' },
      { id: 'complete', label: 'Complete' },
    ]

    const currentIndex = steps.findIndex((s) => s.id === currentStep)

    return (
      <div className="flex items-center justify-center mb-8">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold ${
                index <= currentIndex
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}
            >
              {index + 1}
            </div>
            <div className="ml-2 mr-4 text-sm font-medium text-gray-700">
              {step.label}
            </div>
            {index < steps.length - 1 && (
              <div className="w-12 h-1 bg-gray-300 mr-4" />
            )}
          </div>
        ))}
      </div>
    )
  }

  const renderTopicInput = () => (
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Step 1: Enter Your Video Topic
      </h2>
      <form onSubmit={handleSubmitTopic}>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g., A brave cat rescues a bird"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            required
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              <option value="en">English</option>
              <option value="zh">Chinese</option>
              <option value="fr">French</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) as VideoDuration)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
              <option value={90}>90 seconds</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          disabled={createVideoMutation.isPending}
          className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {createVideoMutation.isPending ? 'Creating...' : 'Create Video'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <Link to="/" className="text-blue-600 hover:underline text-sm">
          ← Back to Home
        </Link>
      </div>
    </div>
  )

  const renderAnalyzing = () => (
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto text-center">
      <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        Analyzing Your Story...
      </h2>
      <p className="text-gray-600">
        AI is analyzing your topic and generating story concepts.
      </p>
    </div>
  )

  const renderScriptReview = () => (
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Step 2: Review Story Analysis & Generate Script
      </h2>

      {storyAnalysis && (
        <div className="mb-8 p-6 bg-blue-50 rounded-lg">
          <h3 className="font-bold text-gray-900 mb-2">Story Analysis</h3>
          <p className="text-gray-700 mb-4">{storyAnalysis.concept}</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <span className="font-semibold">Themes:</span>{' '}
              {storyAnalysis.themes.join(', ')}
            </div>
            <div>
              <span className="font-semibold">Mood:</span> {storyAnalysis.mood}
            </div>
          </div>
          <div className="mt-2">
            <span className="font-semibold">Characters:</span>{' '}
            {storyAnalysis.characters.join(', ')}
          </div>

          {/* Feedback for regenerating analysis */}
          <div className="mt-6 pt-4 border-t border-blue-200">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Not quite right? Provide feedback to regenerate:
            </label>
            <textarea
              value={analysisFeedback}
              onChange={(e) => setAnalysisFeedback(e.target.value)}
              placeholder="E.g., 'Make it more dramatic' or 'Add a surprise twist'"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
            />
            <button
              onClick={() => {
                if (videoId) {
                  analyzeStoryMutation.mutate({ vid: videoId, feedback: analysisFeedback })
                }
              }}
              disabled={!analysisFeedback.trim() || analyzeStoryMutation.isPending}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {analyzeStoryMutation.isPending ? 'Regenerating...' : 'Regenerate Analysis'}
            </button>
          </div>
        </div>
      )}

      {!script ? (
        <div className="space-y-3">
          <button
            onClick={handleGenerateScript}
            disabled={generateScriptMutation.isPending}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
          >
            {generateScriptMutation.isPending ? 'Generating Script...' : 'Generate Script'}
          </button>
          <button
            onClick={handleBackFromScriptReview}
            className="w-full bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
          >
            ← Back to Topic
          </button>
        </div>
      ) : (
        <div>
          <div className="mb-6 p-6 bg-green-50 rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900">Generated Script</h3>
              {!isEditingScript && (
                <button
                  onClick={handleEnableScriptEdit}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  ✏️ Edit Script
                </button>
              )}
            </div>
            <div className="space-y-4">
              {(isEditingScript ? editedScript?.scenes : script.scenes)?.map((scene: any) => (
                <div key={scene.id} className="bg-white p-4 rounded-lg shadow-sm">
                  <div className="text-sm text-gray-500 mb-2">
                    Scene {scene.order} ({scene.startTime}s - {scene.endTime}s)
                  </div>
                  {isEditingScript ? (
                    <textarea
                      value={scene.narration}
                      onChange={(e) => handleSceneNarrationChange(scene.id, e.target.value)}
                      className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={3}
                    />
                  ) : (
                    <p className="text-gray-800">{scene.narration}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm text-gray-600">
              Word count: {script.wordCount} | Duration: {script.estimatedDuration}s
            </div>
            {isEditingScript && (
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleSaveScriptEdit}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
                >
                  💾 Save Changes
                </button>
                <button
                  onClick={handleCancelScriptEdit}
                  className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 transition-colors"
                >
                  ✖ Cancel
                </button>
              </div>
            )}
          </div>

          {/* Script approval/revision section */}
          <div className="space-y-4">
            <button
              onClick={handleApproveScript}
              disabled={approveScriptMutation.isPending}
              className="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 transition-colors"
            >
              {approveScriptMutation.isPending ? 'Approving...' : 'Approve Script & Continue'}
            </button>

            <button
              onClick={handleBackFromScriptReview}
              className="w-full bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              ← Back to Topic
            </button>

            <div className="p-4 bg-gray-50 rounded-lg">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Need changes? Provide revision notes:
              </label>
              <textarea
                value={scriptRevisionNotes}
                onChange={(e) => setScriptRevisionNotes(e.target.value)}
                placeholder="E.g., 'Make scene 2 shorter' or 'Add more emotion to the ending'"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                rows={3}
              />
              <button
                onClick={handleRequestScriptRevision}
                disabled={!scriptRevisionNotes.trim() || approveScriptMutation.isPending}
                className="mt-2 px-4 py-2 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {approveScriptMutation.isPending ? 'Requesting...' : 'Request Script Revision'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 text-center text-sm text-gray-500">
        Cost so far: ${totalCost.toFixed(4)}
      </div>
    </div>
  )

  const renderStoryboardReview = () => (
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Step 3: Review Storyboard
      </h2>

      {!storyboard ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Generating storyboard...</p>
        </div>
      ) : (
        <div>
          <div className="mb-6 p-6 bg-purple-50 rounded-lg">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900">{storyboard.storyboard.title}</h3>
              {!isEditingStoryboard && (
                <button
                  onClick={handleEnableStoryboardEdit}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  ✏️ Edit Storyboard
                </button>
              )}
            </div>
            <p className="text-gray-700 mb-4">{storyboard.storyboard.description}</p>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-semibold">Visual Style:</span>{' '}
                {storyboard.storyboard.visualStyle}
              </div>
              <div>
                <span className="font-semibold">Color Palette:</span>{' '}
                {storyboard.storyboard.colorPalette}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-1 gap-4 mb-6">
            {(isEditingStoryboard ? editedStoryboard?.scenes : storyboard.scenes)?.map((scene: any) => (
              <div key={scene.id} className="border rounded-lg p-4 bg-gray-50">
                <h4 className="font-bold text-gray-900 mb-2">
                  Scene {scene.order}: {scene.title}
                </h4>
                {isEditingStoryboard ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Scene Description:
                      </label>
                      <textarea
                        value={scene.description}
                        onChange={(e) => handleSceneDescriptionChange(scene.id, e.target.value)}
                        className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        rows={2}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        DALL-E Image Prompt:
                      </label>
                      <textarea
                        value={scene.imagePrompt}
                        onChange={(e) => handleSceneImagePromptChange(scene.id, e.target.value)}
                        className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                        rows={3}
                      />
                    </div>
                    <div className="text-xs text-gray-500 space-y-1">
                      <div><strong>Camera:</strong> {scene.cameraAngle}</div>
                      <div><strong>Lighting:</strong> {scene.lighting}</div>
                      <div><strong>Transition:</strong> {scene.transition}</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-700 mb-3">{scene.description}</p>
                    <div className="mb-3 p-3 bg-white rounded border border-purple-200">
                      <div className="text-xs font-semibold text-purple-700 mb-1">DALL-E Prompt:</div>
                      <p className="text-sm text-gray-700">{scene.imagePrompt}</p>
                    </div>
                    <div className="text-xs text-gray-500 space-y-1">
                      <div><strong>Camera:</strong> {scene.cameraAngle}</div>
                      <div><strong>Lighting:</strong> {scene.lighting}</div>
                      <div><strong>Transition:</strong> {scene.transition}</div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {isEditingStoryboard && (
            <div className="mb-4 flex gap-3">
              <button
                onClick={handleSaveStoryboardEdit}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                💾 Save Changes
              </button>
              <button
                onClick={handleCancelStoryboardEdit}
                className="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 transition-colors"
              >
                ✖ Cancel
              </button>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleApproveStoryboard}
              disabled={approveStoryboardMutation.isPending}
              className="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 transition-colors"
            >
              {approveStoryboardMutation.isPending
                ? 'Approving...'
                : 'Approve Storyboard & Generate Assets'}
            </button>

            <button
              onClick={handleBackFromStoryboardReview}
              className="w-full bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              ← Back to Script
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 text-center text-sm text-gray-500">
        Cost so far: ${totalCost.toFixed(4)}
      </div>
    </div>
  )

  const renderAssetsReview = () => (
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Step 4: Review Generated Assets
      </h2>

      {!assets ? (
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 mb-2">Generating assets with DALL-E 3...</p>
          <p className="text-sm text-gray-500">This may take 30-90 seconds</p>
        </div>
      ) : (
        <div>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {assets.map((asset, index) => (
              <div key={index} className="border rounded-lg p-4 bg-gray-50">
                <div className="aspect-video bg-gray-200 rounded mb-3 flex items-center justify-center overflow-hidden">
                  <img
                    src={asset.url}
                    alt={`Scene ${index + 1}`}
                    className="w-full h-full object-cover rounded"
                  />
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  Scene {index + 1} | ${asset.cost.toFixed(2)}
                  {asset.reused && (
                    <span className="ml-2 text-green-600 font-semibold">(Reused)</span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setRegeneratingAssetIndex(index)
                    // TODO: Implement asset regeneration API call
                    // This would need a new endpoint: POST /api/videos/:videoId/assets/:assetId/regenerate
                    setTimeout(() => {
                      setRegeneratingAssetIndex(null)
                      alert('Asset regeneration not yet implemented in backend')
                    }, 1000)
                  }}
                  disabled={regeneratingAssetIndex === index}
                  className="w-full px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {regeneratingAssetIndex === index ? 'Regenerating...' : 'Regenerate'}
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <button
              onClick={handleApproveAssets}
              disabled={approveAssetsMutation.isPending}
              className="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 transition-colors"
            >
              {approveAssetsMutation.isPending ? 'Approving...' : 'Approve Assets & Render Video'}
            </button>

            <button
              onClick={handleBackFromAssetsReview}
              className="w-full bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
            >
              ← Back to Storyboard
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 text-center text-sm text-gray-500">
        Cost so far: ${totalCost.toFixed(4)}
      </div>
    </div>
  )

  const renderRendering = () => (
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto text-center">
      <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">
        Rendering Your Video...
      </h2>
      <p className="text-gray-600 mb-1">Generating voice narration...</p>
      <p className="text-gray-600 mb-1">Adding motion effects...</p>
      <p className="text-gray-600">Assembling final video...</p>
      <p className="text-sm text-gray-500 mt-4">This may take 40-90 seconds</p>

      <div className="mt-6 pt-6 border-t">
        <p className="text-sm text-gray-500 mb-3">Need to make changes?</p>
        <button
          onClick={handleBackToAssetsReview}
          className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
        >
          ← Cancel & Go Back
        </button>
      </div>
    </div>
  )

  const renderComplete = () => (
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Video Ready!
        </h2>
        <p className="text-gray-600">
          Your video has been successfully generated and is ready to download.
        </p>
      </div>

      {video && (
        <div className="space-y-4">
          <div className="bg-gray-100 p-4 rounded-lg">
            <h3 className="font-bold text-gray-900 mb-3">Video Details</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Duration:</span>
                <span className="font-semibold">{video.duration}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Resolution:</span>
                <span className="font-semibold">{video.resolution}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">File Size:</span>
                <span className="font-semibold">
                  {(video.fileSize / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Format:</span>
                <span className="font-semibold">{video.format}</span>
              </div>
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="text-gray-600">Total Cost:</span>
                <span className="font-bold text-green-600">
                  ${totalCost.toFixed(4)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h3 className="font-bold text-gray-900 mb-3 text-center">
              ✏️ Edit & Regenerate
            </h3>
            <p className="text-sm text-gray-600 mb-3 text-center">
              Go back to any step to make changes and regenerate your video
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleBackToInput}
                className="text-sm bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                📝 Edit Topic
              </button>
              <button
                onClick={handleBackToScriptReview}
                className="text-sm bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                📜 Edit Script
              </button>
              <button
                onClick={handleBackToStoryboardReview}
                className="text-sm bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                🎬 Edit Storyboard
              </button>
              <button
                onClick={handleBackToAssetsReview}
                className="text-sm bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                🎨 Regenerate Assets
              </button>
            </div>
          </div>

          <a
            href={`http://localhost:8000/api/videos/${videoId}/download`}
            download={`video_${videoId}.mp4`}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-blue-600 text-white text-center px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Download Video (MP4)
          </a>

          {video.subtitlesUrl && (
            <a
              href={`http://localhost:8000/api/videos/${videoId}/subtitles`}
              download={`subtitles_${videoId}.srt`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full bg-gray-600 text-white text-center px-6 py-3 rounded-lg font-semibold hover:bg-gray-700 transition-colors"
            >
              Download Subtitles (SRT)
            </a>
          )}

          <div className="flex gap-4">
            <Link
              to="/library"
              className="flex-1 bg-purple-600 text-white text-center px-6 py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
            >
              View in Library
            </Link>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
            >
              Create Another Video
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 py-12">
      <div className="container mx-auto px-4">
        {renderStepIndicator()}

        {currentStep === 'input' && renderTopicInput()}
        {currentStep === 'analyzing' && renderAnalyzing()}
        {currentStep === 'script_review' && renderScriptReview()}
        {currentStep === 'storyboard_review' && renderStoryboardReview()}
        {currentStep === 'assets_review' && renderAssetsReview()}
        {currentStep === 'rendering' && renderRendering()}
        {currentStep === 'complete' && renderComplete()}
      </div>
    </div>
  )
}
