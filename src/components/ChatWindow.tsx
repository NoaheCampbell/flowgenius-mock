import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, MessageCircle, ArrowDown, StopCircle } from 'lucide-react'
import { nanoid } from 'nanoid'
import { IPC_CHANNELS } from '../../electron/lib/ipc-channels'
import ModelSelector from './ModelSelector'
import ChatMessage from './ChatMessage'
import { ChatMessage as ChatMessageType } from '../../src/types'

export default function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [input, setInput] = useState('')
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false)
  const [projectContext, setProjectContext] = useState<any>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const [isUserScrolling, setIsUserScrolling] = useState(false)

  // Apply dark mode if needed
  useEffect(() => {
    const savedTheme = localStorage.getItem('loadout-theme')
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark')
    }
    
    // Notify that we're ready to receive messages
    window.ipcRenderer.send('chat-window-ready')
  }, [])

  // Listen for open settings event from ModelSelector
  useEffect(() => {
    const handleOpenSettings = () => {
      // Send message to main window to open settings
      window.ipcRenderer.send(IPC_CHANNELS.CHAT_WINDOW_MESSAGE, {
        type: 'open-settings'
      })
    }
    
    window.addEventListener('open-settings', handleOpenSettings)
    return () => window.removeEventListener('open-settings', handleOpenSettings)
  }, [])

  // Listen for initial sync data and messages from main window
  useEffect(() => {
    const handleSync = (event: any, data: any) => {
      if (data.messages) setMessages(data.messages)
      if (data.projectContext) setProjectContext(data.projectContext)
    }

    const handleMessage = (event: any, data: any) => {
      if (data.type === 'new-message') {
        setMessages(prev => {
          // Check if message already exists to prevent duplicates
          const exists = prev.some(msg => msg.id === data.message.id)
          if (exists) {
            return prev
          }
          return [...prev, data.message]
        })
      } else if (data.type === 'update-message') {
        // Update existing message instead of adding new one
        setMessages(prev => {
          const existing = prev.find(msg => msg.id === data.message.id)
          if (existing) {
            return prev.map(msg => 
              msg.id === data.message.id 
                ? { ...msg, content: data.message.content }
                : msg
            )
          } else {
            // If message doesn't exist yet, add it
            return [...prev, data.message]
          }
        })
      } else if (data.type === 'update-context') {
        setProjectContext(data.projectContext)
      } else if (data.type === 'response-status') {
        setIsWaitingForResponse(data.isWaiting)
      }
    }

    window.ipcRenderer.on(IPC_CHANNELS.CHAT_WINDOW_SYNC, handleSync)
    window.ipcRenderer.on(IPC_CHANNELS.CHAT_WINDOW_MESSAGE, handleMessage)

    return () => {
      window.ipcRenderer.removeAllListeners(IPC_CHANNELS.CHAT_WINDOW_SYNC)
      window.ipcRenderer.removeAllListeners(IPC_CHANNELS.CHAT_WINDOW_MESSAGE)
    }
  }, [])

  // Auto scroll
  useEffect(() => {
    if (!isUserScrolling) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isUserScrolling])

  const handleScroll = () => {
    if (!chatContainerRef.current) return
    
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    
    if (isAtBottom && isUserScrolling) {
      setIsUserScrolling(false)
    } else if (!isAtBottom && !isUserScrolling) {
      setIsUserScrolling(true)
    }
  }

  const handleSend = () => {
    if (!input.trim() || isWaitingForResponse) return

    const newMessage: ChatMessageType = {
      id: nanoid(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    }

    // Add to local state immediately so it shows up
    setMessages(prev => [...prev, newMessage])
    
    // Send to main window
    window.ipcRenderer.send(IPC_CHANNELS.CHAT_WINDOW_MESSAGE, {
      type: 'user-message',
      message: newMessage
    })

    setInput('')
  }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
      {/* Header - Draggable */}
      <div 
        className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 bg-gray-50 dark:bg-gray-900"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="flex items-center justify-between">
          <div className="text-center flex-1">
            <h3 className="font-semibold">UI Assistant</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">Ask questions or request changes to your UI</p>
          </div>
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <ModelSelector variant="compact" />
          </div>
        </div>
      </div>

      {/* Messages */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4"
        onScroll={handleScroll}
      >
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Start a conversation about your UI</p>
              <p className="text-xs mt-2">Ask questions or request specific changes</p>
            </div>
          )}
          
          {messages.map((message, index) => (
            <ChatMessage 
              key={message.id} 
              message={message} 
              isStreaming={isWaitingForResponse && index === messages.length - 1 && message.role === 'assistant'}
            />
          ))}
          
          {isWaitingForResponse && (
            <div className="flex justify-start">
              <div className="bg-gray-100 dark:bg-gray-700 px-4 py-2 rounded-lg">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
          
          <div ref={chatEndRef} />
        </div>
        
        {/* New messages indicator */}
        {isUserScrolling && isWaitingForResponse && (
          <button
            onClick={() => {
              setIsUserScrolling(false)
              chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            }}
            className="fixed bottom-20 right-4 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-full shadow-lg text-sm flex items-center gap-1 transition-all duration-200"
          >
            <ArrowDown className="w-3 h-3" />
            New messages
          </button>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !isWaitingForResponse && handleSend()}
            placeholder="Ask about UI or request changes..."
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            disabled={isWaitingForResponse}
          />
          {isWaitingForResponse ? (
            <button
              onClick={async () => {
                try {
                  await window.ipcRenderer.invoke(IPC_CHANNELS.STOP_GENERATION)
                  setIsWaitingForResponse(false)
                  window.ipcRenderer.send(IPC_CHANNELS.CHAT_WINDOW_MESSAGE, {
                    type: 'stop-generation'
                  })
                } catch (error) {
                  console.error('Failed to stop generation:', error)
                }
              }}
              className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <StopCircle className="w-4 h-4" />
              Stop
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
} 