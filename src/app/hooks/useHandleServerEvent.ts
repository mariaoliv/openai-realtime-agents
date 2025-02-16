"use client";

import { ServerEvent, SessionStatus, AgentConfig } from "@/app/types";
import { useTranscript } from "@/app/contexts/TranscriptContext";
import { useEvent } from "@/app/contexts/EventContext";
import { useRef } from "react";
import { time } from "console";

export interface UseHandleServerEventParams {
  setSessionStatus: (status: SessionStatus) => void;
  selectedAgentName: string;
  selectedAgentConfigSet: AgentConfig[] | null;
  sendClientEvent: (eventObj: any, eventNameSuffix?: string) => void;
  setSelectedAgentName: (name: string) => void;
  shouldForceResponse?: boolean;
  wpmCallback: (wpm: number) => void;
}


var timestarted = Date.now();
var timeEnded = Date.now();
var time_ai_started = Date.now();
var time_ai_ended = Date.now();
var wpm_array:number[] = [];

export function useHandleServerEvent({
  setSessionStatus,
  selectedAgentName,
  selectedAgentConfigSet,
  sendClientEvent,
  setSelectedAgentName,
  wpmCallback,
}: UseHandleServerEventParams) {
  const {
    transcriptItems,
    addTranscriptBreadcrumb,
    addTranscriptMessage,
    updateTranscriptMessage,
    updateTranscriptItemStatus,
  } = useTranscript();

  const { logServerEvent } = useEvent();

  var timestamp = Date.now();
  var timestamp_ai = Date.now();

  var user_wpm = 0;
  var ai_wpm = 0;

  const handleFunctionCall = async (functionCallParams: {
    name: string;
    call_id?: string;
    arguments: string;
  }) => {
    const args = JSON.parse(functionCallParams.arguments);
    const currentAgent = selectedAgentConfigSet?.find(
      (a) => a.name === selectedAgentName
    );

    addTranscriptBreadcrumb(`function call: ${functionCallParams.name}`, args);

    if (currentAgent?.toolLogic?.[functionCallParams.name]) {
      const fn = currentAgent.toolLogic[functionCallParams.name];
      const fnResult = await fn(args, transcriptItems);
      addTranscriptBreadcrumb(
        `function call result: ${functionCallParams.name}`,
        fnResult
      );

      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCallParams.call_id,
          output: JSON.stringify(fnResult),
        },
      });
      sendClientEvent({ type: "response.create" });
    } else if (functionCallParams.name === "transferAgents") {
      const destinationAgent = args.destination_agent;
      const newAgentConfig =
        selectedAgentConfigSet?.find((a) => a.name === destinationAgent) || null;
      if (newAgentConfig) {
        setSelectedAgentName(destinationAgent);
      }
      const functionCallOutput = {
        destination_agent: destinationAgent,
        did_transfer: !!newAgentConfig,
      };
      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCallParams.call_id,
          output: JSON.stringify(functionCallOutput),
        },
      });
      addTranscriptBreadcrumb(
        `function call: ${functionCallParams.name} response`,
        functionCallOutput
      );
    } else {
      const simulatedResult = { result: true };
      addTranscriptBreadcrumb(
        `function call fallback: ${functionCallParams.name}`,
        simulatedResult
      );

      sendClientEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: functionCallParams.call_id,
          output: JSON.stringify(simulatedResult),
        },
      });
      sendClientEvent({ type: "response.create" });
    }
  };

  const handleServerEvent = (serverEvent: ServerEvent) => {
    logServerEvent(serverEvent);
    // console.log(serverEvent.type);

    switch (serverEvent.type) {
      case "session.created": {
        if (serverEvent.session?.id) {
          setSessionStatus("CONNECTED");
          addTranscriptBreadcrumb(
            `session.id: ${
              serverEvent.session.id
            }\nStarted at: ${new Date().toLocaleString()}`
          );
        }
        break;
      }

      case "conversation.item.created": {
        let text =
          serverEvent.item?.content?.[0]?.text ||
          serverEvent.item?.content?.[0]?.transcript ||
          "";
        const role = serverEvent.item?.role as "user" | "assistant";

        if (role === "assistant") {
          timestamp_ai = Date.now();
          console.log('ai timestamp',timestamp_ai);
        }
        else {
          timestamp = Date.now();
          console.log('user timestamp',timestamp);
        }

        const itemId = serverEvent.item?.id;

        if (itemId && transcriptItems.some((item) => item.itemId === itemId)) {
          break;
        }

        if (itemId && role) {
          if (role === "user" && !text) {
            text = "[Transcribing...]";
          }
          addTranscriptMessage(itemId, role, text);
        }
        break;
      }

      case "conversation.item.input_audio_transcription.completed": {
        const itemId = serverEvent.item_id;
        const finalTranscript =
          !serverEvent.transcript || serverEvent.transcript === "\n"
            ? "[inaudible]"
            : serverEvent.transcript;
        // addTranscriptBreadcrumb(
        //   `title: "audio input completed", data`,
        //   {
        //     time_passed,
        //     num_words,
        //     wpm,
        //   } 
        // );
        if (itemId) {
          updateTranscriptMessage(itemId, finalTranscript, false);
        }

        const time_passed = timeEnded - timestarted;
        const num_words = finalTranscript.split(/\s/).length - 1;
        const wpm = Math.floor((num_words / time_passed) * 60000);
        console.log(`[input_audio_transcription.completed] USER time_passed=${time_passed}, num_words=${num_words}, wpm=${wpm}`);
        if (wpm > 0) {
          wpm_array.push(wpm);
          const average = Math.floor(wpm_array.reduce((a, b) => a + b) / wpm_array.length);
          console.log('WPM array',wpm_array,'Average WPM',average);
          wpmCallback(average);
        }
        break;
      }

      case "input_audio_buffer.commit": {
        //timestamp = Date.now();
      }


      case "response.audio_transcript.delta": {
        const itemId = serverEvent.item_id;
        const deltaText = serverEvent.delta || "";
        if (itemId) {
          updateTranscriptMessage(itemId, deltaText, true);
        }
        break;
      }


      case "response.audio_transcript.done": {
        const itemId = serverEvent.item_id;
        const text = serverEvent.transcript || "";
        const time_diff = Date.now() - timestamp_ai;
        const num_words = text.split(/\s/).length;
        const wpms = (num_words / time_diff) * 6000;
        ai_wpm = wpms;
        console.log(`[audio_transcript.done] AI num_words=${num_words}, time_diff=${time_diff}, wpms=${wpms}`);

        if (Math.abs(ai_wpm - user_wpm) > 100) {
          if (user_wpm > ai_wpm) {
            console.log('user is faster ', user_wpm, ai_wpm);
          }
          else {
            console.log('ai is faster', user_wpm, ai_wpm);
          }
        }
      }

      case "response.done": {
        const text = serverEvent.item?.content?.[0]?.transcript || "";

        if (serverEvent.response?.output) {
          serverEvent.response.output.forEach((outputItem) => {
            if (
              outputItem.type === "function_call" &&
              outputItem.name &&
              outputItem.arguments
            ) {
              handleFunctionCall({
                name: outputItem.name,
                call_id: outputItem.call_id,
                arguments: outputItem.arguments,
              });
            }
          });
        }
        break;
      }

      case 'input_audio_buffer.cleared':{
        timestarted = Date.now();
        console.log('USER speech started',Date.now(),'timestamp',timestarted);
        break;
      }

      case 'input_audio_buffer.committed':{
        timeEnded = Date.now();
        const diff = timeEnded - timestarted;
        break;
      }

      case 'output_audio_buffer.started':{
        time_ai_started = Date.now();
        console.log('AI speech started',Date.now(),'timestamp',time_ai_started);
        break;
      }

      case 'output_audio_buffer.stopped':{
        time_ai_ended = Date.now();
        const diff = time_ai_ended - time_ai_started;
        console.log('AI speech ended',Date.now(),'timestamp',time_ai_ended);
        console.log('AI speech time taken',diff);
        break;
      }

      case "response.output_item.done": {
        const itemId = serverEvent.item?.id;
        if (itemId) {
          updateTranscriptItemStatus(itemId, "DONE");
        }
        break;
      }

      case "output_audio_buffer.started": {
        const itemId = serverEvent.item?.id;
        if (itemId) {
          addTranscriptBreadcrumb(`title: "audio input started", data`)
          updateTranscriptItemStatus(itemId, "IN_PROGRESS");
        }
        //timestamp = Date.now();
        //alert("output_audio_buffer.started");
        break;
      }

      default:
        break;
    }
  };

  const handleServerEventRef = useRef(handleServerEvent);
  handleServerEventRef.current = handleServerEvent;

  return handleServerEventRef;
}
