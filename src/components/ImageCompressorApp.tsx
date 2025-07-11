import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, Download, Trash2, ImageIcon, X, Settings, GitCompare, RefreshCw, Loader2, CheckCircle, Pause, Play, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'react-hot-toast';
import imageCompression from 'browser-image-compression';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { blink } from '@/blink/client';

interface CompressedImage {
  id: string;
  name: string;
  originalSize: number;
  compressedSize: number;
  originalFile: File;
  compressedFile: File | null;
  compressionRatio: number;
  preview: string;
  compressedPreview: string;
  status: 'idle' | 'queued' | 'compressing' | 'compressed' | 'error' | 'cancelled';
}

interface User {
  id: string;
  email: string;
  displayName?: string;
}

interface ImageCompressorAppProps {
  user: User;
}

const MAX_UPLOAD_SIZE_MB = 5;
const MAX_CONCURRENT = 3;

const ImageCompressorApp: React.FC<ImageCompressorAppProps> = ({ user }) => {
  const [images, setImages] = useState<CompressedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<CompressedImage | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isRecompressing, setIsRecompressing] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const [active, setActive] = useState<string[]>([]);
  const [completed, setCompleted] = useState<number>(0);
  const [paused, setPaused] = useState(false);

  // Compression settings
  const [quality, setQuality] = useState(0.8);
  const [maxWidth, setMaxWidth] = useState(1920);
  const [maxHeight, setMaxHeight] = useState(1080);
  const [outputFormat, setOutputFormat] = useState<'auto' | 'jpeg' | 'png' | 'webp'>('webp');

  // For queue management
  const queueRef = useRef<string[]>([]);
  const activeRef = useRef<string[]>([]);
  const pausedRef = useRef(false);

  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    if (images.length > 0 && !selectedImage) {
      setSelectedImage(images[0]);
    }
    if (images.length === 0) {
      setSelectedImage(null);
    }
  }, [images, selectedImage]);

  // Batch progress
  const totalToProcess = images.filter(img => img.status !== 'idle' && img.status !== 'cancelled').length;
  const batchProgress = totalToProcess > 0 ? Math.round((completed / totalToProcess) * 100) : 0;

  const handleLogout = () => {
    blink.auth.logout();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileExtension = (filename: string) => {
    return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2);
  }

  // Web optimized preset
  const setWebOptimized = () => {
    setQuality(0.8);
    setMaxWidth(1920);
    setMaxHeight(1080);
    setOutputFormat('webp');
    toast.success('Web Optimized preset applied!');
  };

  // Main compression function
  const compressImage = async (file: File, settings: { quality: number; maxWidth: number; maxHeight: number; outputFormat: string; }): Promise<{ compressedFile: File; compressedPreview: string; compressionRatio: number; name: string; compressedSize: number; }> => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: Math.max(settings.maxWidth, settings.maxHeight),
      useWebWorker: true,
      initialQuality: settings.quality,
      fileType: settings.outputFormat === 'auto' ? file.type : `image/${settings.outputFormat}`,
    };
    const compressedFile = await imageCompression(file, options);
    const compressionRatio = Math.max(0, Math.round((1 - compressedFile.size / file.size) * 100));
    let newName = file.name;
    if (settings.outputFormat !== 'auto') {
      const originalExt = getFileExtension(file.name);
      if (originalExt) {
        newName = file.name.replace(new RegExp(`\\.${originalExt}$`), `.${settings.outputFormat}`);
      } else {
        newName = `${file.name}.${settings.outputFormat}`;
      }
    }
    return {
      compressedFile,
      compressedPreview: URL.createObjectURL(compressedFile),
      compressionRatio,
      name: newName,
      compressedSize: compressedFile.size,
    };
  };

  // Queue management
  const processQueue = useCallback(async () => {
    if (pausedRef.current) return;
    if (activeRef.current.length >= MAX_CONCURRENT) return;
    if (queueRef.current.length === 0) return;
    const nextId = queueRef.current[0];
    setActive(prev => [...prev, nextId]);
    setQueue(prev => prev.slice(1));
    setImages(prev => prev.map(img => img.id === nextId ? { ...img, status: 'compressing' } : img));
    try {
      const img = images.find(i => i.id === nextId);
      if (!img) return;
      const settings = { quality, maxWidth, maxHeight, outputFormat };
      const { compressedFile, compressedPreview, compressionRatio, name, compressedSize } = await compressImage(img.originalFile, settings);
      setImages(prev => prev.map(image => image.id === nextId ? {
        ...image,
        compressedFile,
        compressedPreview,
        compressionRatio,
        name,
        compressedSize,
        status: 'compressed',
      } : image));
      setCompleted(prev => prev + 1);
    } catch {
      setImages(prev => prev.map(image => image.id === nextId ? { ...image, status: 'error' } : image));
    } finally {
      setActive(prev => prev.filter(id => id !== nextId));
      setTimeout(processQueue, 0);
    }
  }, [images, quality, maxWidth, maxHeight, outputFormat]);

  useEffect(() => {
    if (!paused && queue.length > 0 && active.length < MAX_CONCURRENT) {
      processQueue();
    }
  }, [queue, active, paused, processQueue]);

  // Add files to queue
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast.error('Please select valid image files');
      return;
    }
    const oversizedFiles = imageFiles.filter(file => file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      toast.error(`Some files exceed the ${MAX_UPLOAD_SIZE_MB}MB size limit.`);
      return;
    }
    setIsCompressing(true);
    const newImages: CompressedImage[] = imageFiles.map(file => ({
      id: Math.random().toString(36).substring(7),
      name: file.name,
      originalSize: file.size,
      compressedSize: 0,
      originalFile: file,
      compressedFile: null,
      compressionRatio: 0,
      preview: URL.createObjectURL(file),
      compressedPreview: '',
      status: 'queued',
    }));
    setImages(prev => [...prev, ...newImages]);
    setQueue(prev => [...prev, ...newImages.map(img => img.id)]);
    setTimeout(() => setIsCompressing(false), 500);
  }, []);

  // Pause/Resume
  const togglePause = () => setPaused(p => !p);

  // Cancel queued image
  const cancelQueued = (id: string) => {
    setQueue(prev => prev.filter(qid => qid !== id));
    setImages(prev => prev.map(img => img.id === id ? { ...img, status: 'cancelled' } : img));
  };

  // Re-compress selected image
  const recompressSelectedImage = async () => {
    if (!selectedImage) return;
    setIsRecompressing(true);
    try {
      setImages(prev => prev.map(img => img.id === selectedImage.id ? { ...img, status: 'compressing' } : img));
      const settings = { quality, maxWidth, maxHeight, outputFormat };
      const { compressedFile, compressedPreview, compressionRatio, name, compressedSize } = await compressImage(selectedImage.originalFile, settings);
      const updatedImage: CompressedImage = {
        ...selectedImage,
        compressedFile,
        compressedPreview,
        compressionRatio,
        name,
        compressedSize,
        status: 'compressed',
      };
      setImages(prev => prev.map(img => img.id === selectedImage.id ? updatedImage : img));
      setSelectedImage(updatedImage);
      toast.success('Image re-compressed!');
    } catch {
      setImages(prev => prev.map(img => img.id === selectedImage.id ? { ...img, status: 'error' } : img));
      setSelectedImage(prev => prev ? { ...prev, status: 'error' } : null);
      toast.error('Failed to re-compress image');
    } finally {
      setIsRecompressing(false);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); if (e.currentTarget.contains(e.relatedTarget as Node)) return; setIsDragging(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }, [handleFiles]);
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { handleFiles(e.target.files); }, [handleFiles]);

  const downloadImage = (image: CompressedImage) => {
    if (!image.compressedFile) return;
    const url = URL.createObjectURL(image.compressedFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = image.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    const compressedImages = images.filter(img => img.status === 'compressed');
    compressedImages.forEach(img => downloadImage(img));
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const image = prev.find(img => img.id === id);
      if (image) {
        URL.revokeObjectURL(image.preview);
        if (image.compressedPreview) {
          URL.revokeObjectURL(image.compressedPreview);
        }
      }
      const remainingImages = prev.filter(img => img.id !== id);
      if (selectedImage?.id === id) {
        setSelectedImage(remainingImages.length > 0 ? remainingImages[0] : null);
      }
      return remainingImages;
    });
    setQueue(prev => prev.filter(qid => qid !== id));
  };

  const clearAll = () => {
    images.forEach(img => {
      URL.revokeObjectURL(img.preview);
      if (img.compressedPreview) {
        URL.revokeObjectURL(img.compressedPreview);
      }
    });
    setImages([]);
    setQueue([]);
    setActive([]);
    setCompleted(0);
    setSelectedImage(null);
  };

  const getUserInitials = (email: string, displayName?: string) => {
    if (displayName) {
      return displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.charAt(0).toUpperCase();
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
              <GitCompare className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">ImageCompress</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={setWebOptimized} className="hidden md:inline-flex">
              Web Optimized
            </Button>
            <Button onClick={() => document.getElementById('file-input-btn')?.click()} disabled={isCompressing}>
              {isCompressing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              {isCompressing ? 'Uploading...' : 'Upload Images'}
            </Button>
            <input id="file-input-btn" type="file" multiple accept="image/*" onChange={handleFileInput} className="hidden" />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-sm">
                      {getUserInitials(user.email, user.displayName)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    {user.displayName && (
                      <p className="font-medium">{user.displayName}</p>
                    )}
                    <p className="w-[200px] truncate text-sm text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                </div>
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      
      <main className="container mx-auto p-4">
        {/* Batch Progress Bar */}
        {images.length > 0 && (
          <div className="mb-4 flex items-center gap-4">
            <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all" style={{ width: `${batchProgress}%` }} />
            </div>
            <span className="text-sm text-gray-600 min-w-[80px] text-right">{completed}/{totalToProcess} done</span>
            <Button variant="ghost" size="icon" onClick={togglePause} title={paused ? 'Resume' : 'Pause'}>
              {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            </Button>
          </div>
        )}
        
        {images.length === 0 ? (
          <div
            className={`mt-8 p-12 text-center rounded-lg border-2 border-dashed transition-all duration-200 ${isDragging ? 'bg-blue-50 border-blue-400' : 'bg-white border-gray-300 hover:border-blue-400'}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input type="file" multiple accept="image/*" onChange={handleFileInput} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            <div className="flex flex-col items-center justify-center space-y-4">
              <div className="p-4 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full">
                <Upload className="w-10 h-10 text-blue-600" />
              </div>
              <div>
                <p className="text-xl font-semibold text-gray-900 mb-2">
                  {isDragging ? 'Drop your images here' : 'Drop images here or click to browse'}
                </p>
                <p className="text-gray-500">
                  Supports JPG, PNG, WebP. Max file size: {MAX_UPLOAD_SIZE_MB}MB.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="h-[calc(100vh-140px)] rounded-lg border bg-white shadow-sm">
            <ResizablePanel defaultSize={30} minSize={20}>
              <div className="flex h-full flex-col">
                <div className="p-4 border-b">
                  <h2 className="text-lg font-semibold">Uploaded Images ({images.length})</h2>
                </div>
                <ScrollArea className="flex-grow">
                  <div className="p-2 space-y-2">
                    {images.map(image => (
                      <div
                        key={image.id}
                        onClick={() => setSelectedImage(image)}
                        className={`flex items-center p-2 rounded-md cursor-pointer transition-colors ${selectedImage?.id === image.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
                      >
                        <img src={image.preview} alt={image.name} className="w-12 h-12 object-cover rounded-md mr-3" />
                        <div className="flex-grow truncate">
                          <p className="font-semibold text-sm truncate">{image.name}</p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(image.originalSize)} &rarr; {image.status === 'compressed' ? formatFileSize(image.compressedSize) : image.status === 'compressing' ? '...' : ''}
                          </p>
                        </div>
                        {image.status === 'queued' && (
                          <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0" onClick={e => { e.stopPropagation(); cancelQueued(image.id); }} title="Cancel">
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                        {image.status === 'compressing' && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                        {image.status === 'compressed' && <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
                        {image.status === 'error' && <span className="text-xs text-red-500 ml-2">Error</span>}
                        {image.status === 'cancelled' && <span className="text-xs text-gray-400 ml-2">Cancelled</span>}
                        {(image.status === 'compressed' || image.status === 'error' || image.status === 'cancelled') && (
                          <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0" onClick={e => { e.stopPropagation(); removeImage(image.id); }} title="Remove">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="p-4 border-t">
                  <Button onClick={downloadAll} disabled={isCompressing || images.filter(img => img.status === 'compressed').length === 0} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                    <Download className="w-4 h-4 mr-2" /> Download All
                  </Button>
                  <Button onClick={clearAll} variant="outline" className="w-full mt-2">
                    <Trash2 className="w-4 h-4 mr-2" /> Clear All
                  </Button>
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={70}>
              <div className="flex flex-col h-full">
                {selectedImage ? (
                  <>
                    <div className="p-4 border-b flex justify-between items-center">
                      <h3 className="text-lg font-semibold truncate">{selectedImage.name}</h3>
                      <Button onClick={() => downloadImage(selectedImage)} disabled={selectedImage.status !== 'compressed'} size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </Button>
                    </div>
                    <div className="flex-grow p-4 bg-gray-100/50">
                      <ResizablePanelGroup direction="horizontal">
                        <ResizablePanel>
                          <div className="flex flex-col h-full items-center justify-center p-2">
                            <h4 className="text-center font-semibold mb-2">Original</h4>
                            <div className="flex-grow flex items-center justify-center">
                              <img src={selectedImage.preview} alt="Original" className="max-w-full max-h-[50vh] object-contain" />
                            </div>
                            <p className="mt-2 text-sm font-medium">{formatFileSize(selectedImage.originalSize)}</p>
                          </div>
                        </ResizablePanel>
                        <ResizableHandle withHandle />
                        <ResizablePanel>
                          <div className="flex flex-col h-full items-center justify-center p-2">
                            <h4 className="text-center font-semibold mb-2">Compressed</h4>
                            <div className="flex-grow flex items-center justify-center">
                              {selectedImage.status === 'error' && <p className="text-red-500">Error</p>}
                              {selectedImage.compressedPreview ? (
                                <img src={selectedImage.compressedPreview} alt="Compressed" className="max-w-full max-h-[50vh] object-contain" />
                              ) : selectedImage.status === 'compressing' ? (
                                <Loader2 className="w-8 h-8 animate-spin" />
                              ) : (
                                <span className="text-gray-400">No compressed image</span>
                              )}
                            </div>
                            {selectedImage.status === 'compressed' && (
                              <p className="mt-2 text-sm font-medium text-green-600">{formatFileSize(selectedImage.compressedSize)} ({selectedImage.compressionRatio}% saved)</p>
                            )}
                          </div>
                        </ResizablePanel>
                      </ResizablePanelGroup>
                    </div>
                    <div className="p-4 border-t bg-white">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> Compression Settings</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="quality">Quality: {Math.round(quality * 100)}%</Label>
                              <Slider
                                id="quality"
                                min={0.1}
                                max={1}
                                step={0.01}
                                value={[quality]}
                                onValueChange={(value) => setQuality(value[0])}
                                disabled={isCompressing || isRecompressing}
                              />
                            </div>
                            <div>
                              <Label htmlFor="outputFormat">Output Format</Label>
                              <Select value={outputFormat} onValueChange={(value) => setOutputFormat(value as 'auto' | 'jpeg' | 'png' | 'webp')} disabled={isCompressing || isRecompressing}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select format" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="auto">Auto</SelectItem>
                                  <SelectItem value="jpeg">JPEG</SelectItem>
                                  <SelectItem value="png">PNG</SelectItem>
                                  <SelectItem value="webp">WebP</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div className="flex gap-4">
                              <div>
                                <Label htmlFor="maxWidth">Max Width</Label>
                                <Input id="maxWidth" type="number" value={maxWidth} onChange={(e) => setMaxWidth(Number(e.target.value))} placeholder="e.g., 1920" disabled={isCompressing || isRecompressing} />
                              </div>
                              <div>
                                <Label htmlFor="maxHeight">Max Height</Label>
                                <Input id="maxHeight" type="number" value={maxHeight} onChange={(e) => setMaxHeight(Number(e.target.value))} placeholder="e.g., 1080" disabled={isCompressing || isRecompressing} />
                              </div>
                            </div>
                            <Button onClick={recompressSelectedImage} className="w-full" disabled={isRecompressing || isCompressing}>
                              {isRecompressing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                              {isRecompressing ? 'Re-compressing...' : 'Re-compress'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <ImageIcon className="w-24 h-24 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold">Select an image</h3>
                      <p className="text-gray-500">Choose an image from the left panel to see details and compress.</p>
                    </div>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </main>
    </div>
  );
};

export default ImageCompressorApp;