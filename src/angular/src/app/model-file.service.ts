import {Injectable} from '@angular/core';
import {Observable} from "rxjs/Observable";
import {BehaviorSubject} from "rxjs/Rx";

import {Set} from 'immutable';

import {ModelFile} from './model-file'


/**
 * ModelFileService class provides the store for model files
 * It implements the observable service pattern to push updates
 * as they become available.
 * Reference: http://blog.angular-university.io/how-to-build-angular2
 *            -apps-using-rxjs-observable-data-services-pitfalls-to-avoid
 */
@Injectable()
export class ModelFileService {

    private readonly EVENT_URL = "/stream";

    private _files: BehaviorSubject<Set<ModelFile>> = new BehaviorSubject(Set([]));

    constructor() {
        this.init();
    }

    private init() {
        // Add a EventSource observable to receive file list and updates
        // from the backend
        // Observable-SSE code from https://stackoverflow.com/a/36827897/8571324
        let _fileService = this;

        /**
         * Helper function to add an event listener to an event source
         * Forwards the event and its data to the observer's next method
         * @param {string} eventName
         * @param eventSource
         * @param observer
         */
        function addEventListener(eventName: string, eventSource, observer) {
            eventSource.addEventListener(eventName, event => observer.next(
                {
                    "event": eventName,
                    "data": event.data
                }
            ));
        }
        const observable = Observable.create(observer => {
            const eventSource = new EventSource(this.EVENT_URL);
            addEventListener("init", eventSource, observer);
            addEventListener("added", eventSource, observer);
            addEventListener("removed", eventSource, observer);
            addEventListener("updated", eventSource, observer);

            eventSource.onerror = x => observer.error(x);

            return () => {
                eventSource.close();
            };
        });
        observable.subscribe({
            next: (x) => _fileService.parseEvent(x["event"], x["data"]),
            error: err => console.error("SSE Error: " + err)
        });
    }

    /**
     * Parse an event and update the file model
     * @param {string} name
     * @param {string} data
     */
    private parseEvent(name: string, data: string) {
        console.debug("Received event: " + name);
        if(name == "init") {
            // Init event receives an array of ModelFiles
            let parsed = JSON.parse(data);
            let newFiles: ModelFile[] = [];
            for(let file of parsed) {
                newFiles.push(new ModelFile(file));
            }
            // Replace the entire model
            this._files.next(Set(newFiles));
            console.debug("New model: %O", this._files.getValue().toJS());
        } else if(name == "added") {
            // Added event receives old and new ModelFiles
            // Only new file is relevant
            let parsed: {new_file: any} = JSON.parse(data);
            let file = new ModelFile(parsed.new_file);
            const existingFile = this._files.getValue().find(
                modelFile => modelFile.name == file.name
            );
            if(existingFile) {
                console.error("ModelFile named " + file.name + " already exists")
            } else {
                this._files.next(this._files.getValue().add(file));
                console.debug("Added file: %O", file.toJS());
            }
        } else if(name == "removed") {
            // Removed event receives old and new ModelFiles
            // Only old file is relevant
            let parsed: {old_file: any} = JSON.parse(data);
            let file = new ModelFile(parsed.old_file);
            const existingFile = this._files.getValue().find(
                modelFile => modelFile.name == file.name
            );
            if(existingFile) {
                this._files.next(this._files.getValue().remove(existingFile));
                console.debug("Removed file: %O", file.toJS());
            } else {
                console.error("Failed to find ModelFile named " + file.name);
            }
        } else if(name == "updated") {
            // Updated event received old and new ModelFiles
            // We will only use the new one here
            let parsed: {new_file: any} = JSON.parse(data);
            let file = new ModelFile(parsed.new_file);
            const existingFile = this._files.getValue().find(
                modelFile => modelFile.name == file.name
            );
            if(existingFile) {
                this._files.next(
                    this._files.getValue().remove(existingFile)
                                          .add(file)
                );
                console.debug("Updated file: %O", file.toJS());
            } else {
                console.error("Failed to find ModelFile named " + file.name);
            }
        }
    }

    get files() : Observable<Set<ModelFile>> {
        return this._files.asObservable();
    }

}