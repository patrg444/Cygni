"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Star, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { toast } from "sonner";

interface FeedbackData {
  rating: number;
  feedback?: string;
  completedSteps: string[];
  timeSpent: number;
}

export function OnboardingFeedback({ completedSteps }: { completedSteps: string[] }) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [hoveredRating, setHoveredRating] = useState(0);

  const submitFeedbackMutation = useMutation({
    mutationFn: async (data: FeedbackData) => {
      const response = await fetch("/api/onboarding/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to submit feedback");
      return response.json();
    },
    onSuccess: () => {
      toast.success("Thank you for your feedback!");
      setRating(0);
      setFeedback("");
    },
    onError: () => {
      toast.error("Failed to submit feedback. Please try again.");
    },
  });

  const handleSubmit = () => {
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }

    // Calculate approximate time spent (in minutes)
    const timeSpent = Math.round((Date.now() - parseInt(localStorage.getItem("onboardingStartTime") || "0")) / 60000);

    submitFeedbackMutation.mutate({
      rating,
      feedback: feedback.trim() || undefined,
      completedSteps,
      timeSpent,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>How was your onboarding experience?</CardTitle>
        <CardDescription>
          Your feedback helps us improve the experience for everyone
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label>Rate your experience</Label>
          <div className="flex items-center gap-2 mt-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                onClick={() => setRating(value)}
                onMouseEnter={() => setHoveredRating(value)}
                onMouseLeave={() => setHoveredRating(0)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={`h-8 w-8 ${
                    value <= (hoveredRating || rating)
                      ? "text-yellow-500 fill-yellow-500"
                      : "text-gray-300"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="feedback">Additional feedback (optional)</Label>
          <Textarea
            id="feedback"
            placeholder="Tell us what you think..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={rating === 0 || submitFeedbackMutation.isPending}
          className="w-full"
        >
          {submitFeedbackMutation.isPending ? (
            "Submitting..."
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Submit Feedback
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}