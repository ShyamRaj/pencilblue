/*
    Copyright (C) 2014  PencilBlue, LLC

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/**
 * A base interface that system jobs can implement.  The premise is that every
 * job will have an ID and a name.  The job is initialized by calling the
 * "init" function and started by calling the "run" function.  The specific
 * implementation is also provided with functions to report the start, update,
 * and end of the job run.  The advantage to extending this prototype is that
 * the provided functions allow for creating a persisted record of the job.  In
 * addition, log statements generated by the job are also persisted (as long as
 * the provided "log" function is called).
 * @class JobRunner
 * @constructor
 */
function JobRunner(){

    /**
     * An instace of DAO to provide direct access to the DB if it is needed.
     * @property dao
     * @type {DAO}
     */
    this.dao = null;

    /**
     * Holds the unique identifier for the job
     * @property id
     * @type {String}
     */
    this.id = null;

    /**
     * The percentage of the overall work that this job accounts for.  If this
     * job is run by itself then the value should be 1.  This means that 100%
     * of the job is completed by this job.  If, for example, the value is .333
     * then it is assumed that this job accounts for 33% or one third of the
     * over all work necessary to complete the job.  This is handy when a large
     * job is made up of smaller jobs.  This value will assist in allowing the
     * jobs to calculate their update increments.  The number must be a value
     * between 0 (exclusive) & 1 (inclusive).
     * @property taskFactor
     * @type {Float}
     */
    this.chunkOfWorkPercentage = 1;
}

//constants
/**
 * The name of the persistence entity that contains the log statements for the
 * job
 * @private
 * @static
 * @property JOB_LOG_STORE_NAME
 * @type {String}
 */
var JOB_LOG_STORE_NAME = 'job_log';

/**
 * The name of the persistence entity that contains the job descriptor
 * @private
 * @static
 * @property JOB_STORE_NAME
 * @type {String}
 */
var JOB_STORE_NAME     = 'job_run';

/**
 * The status code for a job that is in progress
 * @private
 * @static
 * @property DEFAULT_START_STATUS
 * @type {String}
 */
var DEFAULT_START_STATUS = 'RUNNING';

/**
 * The status code for a job that has completed successfully
 * @private
 * @static
 * @property DEFAULT_DONE_STATUS
 * @type {String}
 */
var DEFAULT_DONE_STATUS  = 'COMPLETED';

/**
 * The status code for a job that has generated a fatal error
 * @private
 * @static
 * @property DEFAULT_ERROR_STATUS
 * @type {String}
 */
var DEFAULT_ERROR_STATUS = 'ERRORED';

/**
 * The initialization function sets the job's name and ID as well as provide an
 * instace of DAO.
 * @method init
 * @param {String} name The job's name
 * @param {String} [jobId] The job's unique identifier
 */
JobRunner.prototype.init = function(name, jobId) {

    this.dao  = new pb.DAO();
    this.id   = jobId || pb.utils.uniqueId().toString();
    this.name = name || this.id;
    return this;
}

/**
 * Retrieves the unique identifier for the job
 * @method getId
 * @return {String} The job ID
 */
JobRunner.prototype.getId = function() {
    return this.id;
};

JobRunner.prototype.setChunkOfWorkPercentage = function(chunkOfWorkPercentage) {
    if (isNaN(chunkOfWorkPercentage) || chunkOfWorkPercentage <= 0 || chunkOfWorkPercentage > 1) {
        throw new Error('The chunkOfWorkPercentage must be a value between 0 (exclusive) and 1 (inclusive)');
    }

    this.chunkOfWorkPercentage = chunkOfWorkPercentage;
    return this;
};

JobRunner.prototype.getChunkOfWorkPercentage = function() {
    return this.chunkOfWorkPercentage;
};

/**
 * Call this function once to start the job.  The job will execute the callback
 * upon completion.
 * @method run
 * @param {Function} cb A callback that provides two parameters: The first is
 * any error that was generated and the second is the implementation specific
 * result of the job.
 */
JobRunner.prototype.run = function(cb) {
    throw new Error('This function must be overriden by an extending prototype');
};

/**
 * Logs a message to the system logger as well as to the persistence layer. The
 * function takes a variable number of arguments.  A string message/pattern
 * followed by the variables to fill in with that data.  See util.format or the
 * implementation for Winston loggers.
 * @method log
 * @param {String} message The message or pattern to log
 */
JobRunner.prototype.log = function() {

    var args = Array.prototype.splice.call(arguments, 0);
    if (args.length > 0) {
        args[0] = this.name+': '+args[0];

        var meta    = [];
        var message = args[0];
        if (args.length > 1) {
            message = util.format.apply(util, args);
        }
        var statement = {
            object_type: JOB_LOG_STORE_NAME,
            job_id: this.id,
            worker_id: pb.system.getWorkerId(),
            name: this.name,
            message: message,
            metadata: meta
        };
        this.dao.update(statement);
        pb.log.debug.apply(pb.log, args);
    }
};

/**
 * To be called once by the extending implmentation to mark the start of the
 * job.  The function persists the job record and makes it available to future
 * calls to onUpdate or onComplete.
 * @method onStart
 * @param {String} [status='RUNNING'] The starting status of the job
 */
JobRunner.prototype.onStart = function(status) {
    var job         = pb.DAO.getIDWhere(this.getId());
    job.object_type = JOB_STORE_NAME;
    job.name        = this.name;
    job.status      = status || DEFAULT_START_STATUS;
    job.progress    = 0;
    this.dao.save(job, function(err, result) {
        if (util.isError(err)) {
            pb.log.error('JobRunner: Failed to mark job as started %s', err.stack);
        }
    });
};

/**
 * To be called by the extending implmentation when progress has been made.
 * The incremental amount of progress should be provided keeping in mind that
 * the overall progress should not exceed 100.  Optionally, the status
 * parameter may also be included.
 * @method onUpdate
 * @param {Integer} progressIncrement
 * @param {String} [status]
 */
JobRunner.prototype.onUpdate = function(progressIncrement, status) {
    this.log('Updating job [%s:%s] by %s percent with status: %s', this.getId(), this.name, progressIncrement, status);

    var query   = pb.DAO.getIDWhere(this.getId());
    var updates = {};
    if (pb.validation.isFloat(progressIncrement, true, true)) {
        updates['$inc'] = {progress: progressIncrement};
    }
    if (pb.validation.validateNonEmptyStr(status, true)) {
        updates['$set'] = {status: status};
    }

    //ensure we need to update
    if (updates !== {}) {

        this.dao.updateFields(JOB_STORE_NAME, query, updates, function(err, result) {
            if (util.isError(err)) {
                pb.log.error('JobRunner: Failed to update job progress - ', err.stack);
            }
        });
    }
};

/**
 * Called once by the extending implementation when the job has completed
 * execution whether that be successful completion or by error.
 * @method onCompleted
 * @param {String} [status] The final status of the job.  If not provided the
 * status will default to 'COMPLETED' or 'ERRORED' when an error is provided as
 * the second parameter.
 * @param {Error} err The error, if any, that was generated by the job's
 * execution
 */
JobRunner.prototype.onCompleted = function(status, err) {
    if (util.isError(status)) {
        err = status;
        status = DEFAULT_ERROR_STATUS;
    }
    else if (!status) {
        status = DEFAULT_DONE_STATUS;
    }

    //log result
    this.log('Setting job [%s:%s] as completed with status: %s', this.getId(), this.name, status);

    //persist result
    var query = pb.DAO.getIDWhere(this.getId());
    var sets  = {
        $set: {
            status: status,
            progress: 100,
            error: err ? err.stack : undefined
        }
    };
    this.dao.updateFields(JOB_STORE_NAME, query, sets, function(err, result) {
        if (util.isError(err)) {
            pb.log.error('JobRunner: Failed to update job as completed - %s', err.stack);
        }
    });
};

//exports
module.exports = JobRunner;
